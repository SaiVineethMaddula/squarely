/**
 * Data access for Squarely. Reads go straight to tables (protected by RLS);
 * every write goes through a database function that validates it.
 */
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Tables } from './database.types'
import type { ExpenseRecord, SettlementRecord } from './balances'
import type { SplitInput } from './splits'

export type Group = Tables<'groups'>
export type Member = Tables<'group_members'>
export type Settlement = Tables<'settlements'>
export type Activity = Tables<'activity_log'>
export type Profile = Tables<'profiles'>

export interface Expense extends Tables<'expenses'> {
  expense_payers: { member_id: string; amount_paise: number }[]
  expense_splits: { member_id: string; amount_paise: number; share_input: number | null }[]
}

export interface GroupSummary {
  group: Group
  myMemberId: string | undefined
  myNet: number
  memberCount: number
}

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

export const keys = {
  groups: ['groups'] as const,
  group: (id: string) => ['group', id] as const,
  profile: ['profile'] as const,
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile,
    queryFn: async (): Promise<Profile> =>
      check(await supabase.from('profiles').select('*').eq('id', userId).single()),
  })
}

export function useMyGroups(userId: string) {
  return useQuery({
    queryKey: keys.groups,
    queryFn: async (): Promise<GroupSummary[]> => {
      const [groups, members, balances] = await Promise.all([
        supabase.from('groups').select('*').is('archived_at', null).order('created_at', { ascending: false }),
        supabase.from('group_members').select('id, group_id, user_id').is('left_at', null),
        supabase.from('member_balances').select('*'),
      ])
      const g = check(groups)
      const m = check(members)
      const b = check(balances)
      const netByMember = new Map(b.map((row) => [row.member_id, row.net_paise ?? 0]))
      return g.map((group) => {
        const groupMembers = m.filter((x) => x.group_id === group.id)
        const mine = groupMembers.find((x) => x.user_id === userId)
        return {
          group,
          myMemberId: mine?.id,
          myNet: mine ? (netByMember.get(mine.id) ?? 0) : 0,
          memberCount: groupMembers.length,
        }
      })
    },
  })
}

export interface GroupData {
  group: Group
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  net: Record<string, number>
  activity: Activity[]
}

export function useGroup(groupId: string) {
  const query = useQuery({
    queryKey: keys.group(groupId),
    queryFn: async (): Promise<GroupData> => {
      const [group, members, expenses, settlements, balances, activity] = await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId).single(),
        supabase.from('group_members').select('*').eq('group_id', groupId).order('joined_at'),
        supabase
          .from('expenses')
          .select('*, expense_payers(member_id, amount_paise), expense_splits(member_id, amount_paise, share_input)')
          .eq('group_id', groupId)
          .is('deleted_at', null)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('settlements')
          .select('*')
          .eq('group_id', groupId)
          .is('deleted_at', null)
          .order('settled_on', { ascending: false }),
        supabase.from('member_balances').select('*').eq('group_id', groupId),
        supabase
          .from('activity_log')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      return {
        group: check(group),
        members: check(members),
        expenses: check(expenses) as Expense[],
        settlements: check(settlements),
        net: Object.fromEntries(check(balances).map((r) => [r.member_id!, r.net_paise ?? 0])),
        activity: check(activity),
      }
    },
  })
  useGroupRealtime(groupId)
  return query
}

/** Refetch a group whenever anyone changes its expenses, payments or members. */
function useGroupRealtime(groupId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: keys.group(groupId) })
      queryClient.invalidateQueries({ queryKey: keys.groups })
    }
    const filter = `group_id=eq.${groupId}`
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter }, refresh)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, queryClient])
}

/** Shape the group's data for the pure balance functions in balances.ts. */
export function toBalanceInputs(data: GroupData): {
  expenses: ExpenseRecord[]
  settlements: SettlementRecord[]
} {
  return {
    expenses: data.expenses.map((e) => ({
      payers: Object.fromEntries(e.expense_payers.map((p) => [p.member_id, p.amount_paise])),
      splits: Object.fromEntries(e.expense_splits.map((s) => [s.member_id, s.amount_paise])),
    })),
    settlements: data.settlements.map((s) => ({
      from: s.from_member,
      to: s.to_member,
      amount: s.amount_paise,
    })),
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function useInvalidateGroup(groupId?: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.groups })
    if (groupId) queryClient.invalidateQueries({ queryKey: keys.group(groupId) })
  }
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroup()
  return useMutation({
    mutationFn: async (name: string) =>
      check(await supabase.rpc('create_group', { p_name: name })),
    onSuccess: invalidate,
  })
}

export function useUpdateGroup(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (patch: { name?: string; simplify_debts?: boolean }) =>
      check(await supabase.from('groups').update(patch).eq('id', groupId).select().single()),
    onSuccess: invalidate,
  })
}

export function useAddPlaceholder(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (name: string) =>
      check(
        await supabase.rpc('add_placeholder_member', { p_group_id: groupId, p_display_name: name }),
      ),
    onSuccess: invalidate,
  })
}

export function useUnclaimMember(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (memberId: string) =>
      check(await supabase.rpc('unclaim_member', { p_member_id: memberId })),
    onSuccess: invalidate,
  })
}

export interface InvitePreview {
  group_id: string
  name: string
  already_member: boolean
  placeholders: { id: string; display_name: string }[]
}

export function useInvitePreview(code: string) {
  return useQuery({
    queryKey: ['invite', code],
    queryFn: async () =>
      check(await supabase.rpc('get_invite_preview', { p_invite_code: code })) as unknown as InvitePreview,
    retry: false,
  })
}

export function useJoinGroup() {
  const invalidate = useInvalidateGroup()
  return useMutation({
    mutationFn: async (args: { code: string; claimMemberId?: string }) =>
      check(
        await supabase.rpc('join_group', {
          p_invite_code: args.code,
          p_claim_member_id: args.claimMemberId,
        }),
      ),
    onSuccess: invalidate,
  })
}

export interface ExpenseInput {
  description: string
  amountPaise: number
  date: string
  category: string
  split: SplitInput
  payerMemberId: string
  splitAmounts: Record<string, number>
}

function expenseArgs(input: ExpenseInput) {
  const shareInput = (memberId: string): number | null => {
    if (input.split.type === 'percent') return input.split.percents[memberId] ?? null
    if (input.split.type === 'shares') return input.split.shares[memberId] ?? null
    return null
  }
  return {
    p_description: input.description,
    p_amount_paise: input.amountPaise,
    p_expense_date: input.date,
    p_category: input.category,
    p_split_type: input.split.type,
    p_payers: [{ member_id: input.payerMemberId, amount_paise: input.amountPaise }],
    p_splits: Object.entries(input.splitAmounts).map(([member_id, amount_paise]) => ({
      member_id,
      amount_paise,
      share_input: shareInput(member_id),
    })),
  }
}

export function useSaveExpense(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async ({ expenseId, input }: { expenseId?: string; input: ExpenseInput }) => {
      if (expenseId) {
        check(await supabase.rpc('update_expense', { p_expense_id: expenseId, ...expenseArgs(input) }))
        return expenseId
      }
      return check(await supabase.rpc('create_expense', { p_group_id: groupId, ...expenseArgs(input) }))
    },
    onSuccess: invalidate,
  })
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (expenseId: string) =>
      check(await supabase.rpc('delete_expense', { p_expense_id: expenseId })),
    onSuccess: invalidate,
  })
}

export function useRecordSettlement(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (args: { from: string; to: string; amountPaise: number; date: string; note: string }) =>
      check(
        await supabase.rpc('record_settlement', {
          p_group_id: groupId,
          p_from_member: args.from,
          p_to_member: args.to,
          p_amount_paise: args.amountPaise,
          p_settled_on: args.date,
          p_note: args.note,
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteSettlement(groupId: string) {
  const invalidate = useInvalidateGroup(groupId)
  return useMutation({
    mutationFn: async (settlementId: string) =>
      check(await supabase.rpc('delete_settlement', { p_settlement_id: settlementId })),
    onSuccess: invalidate,
  })
}

export function useUpdateProfile(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (displayName: string) =>
      check(
        await supabase
          .from('profiles')
          .update({ display_name: displayName, name_confirmed: true })
          .eq('id', userId)
          .select()
          .single(),
      ),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
