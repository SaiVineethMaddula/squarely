import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toBalanceInputs, useGroup, type Activity, type GroupData } from '../lib/api'
import { useUserId } from '../lib/auth'
import { pairwiseDebts, simplifyDebts } from '../lib/balances'
import { formatDate, formatDateTime } from '../lib/dates'
import { formatINR } from '../lib/money'
import { Avatar, Empty, ErrorBox, Loading, NetLabel, Screen } from '../components/ui'

type Tab = 'expenses' | 'balances' | 'activity'

export default function GroupPage() {
  const { groupId = '' } = useParams()
  const userId = useUserId()
  const { data, isPending, error } = useGroup(groupId)
  const [tab, setTab] = useState<Tab>('expenses')

  if (isPending) return <Screen title="" back="/"><Loading /></Screen>
  if (error || !data) return <Screen title="Group" back="/"><ErrorBox error={error} /></Screen>

  const me = data.members.find((m) => m.user_id === userId)
  const myNet = me ? (data.net[me.id] ?? 0) : 0

  return (
    <Screen
      title={data.group.name}
      back="/"
      right={
        <Link
          to={`/g/${groupId}/settings`}
          className="rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
        >
          Members
        </Link>
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-slate-50 p-4">
        <div>
          <p className="text-sm text-slate-500">Your balance</p>
          <p
            className={`text-xl font-bold ${
              myNet > 0 ? 'text-emerald-700' : myNet < 0 ? 'text-red-700' : 'text-slate-700'
            }`}
          >
            {myNet === 0 ? 'All settled' : `${myNet > 0 ? 'You get back' : 'You owe'} ${formatINR(Math.abs(myNet))}`}
          </p>
        </div>
        <Link
          to={`/g/${groupId}/settle`}
          className="rounded-xl border border-brand-600 px-3 py-2 text-sm font-medium text-brand-700"
        >
          Settle up
        </Link>
      </div>

      <nav className="mb-4 grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        {(['expenses', 'balances', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'expenses' && <ExpenseList data={data} myMemberId={me?.id} />}
      {tab === 'balances' && <Balances data={data} myMemberId={me?.id} />}
      {tab === 'activity' && <ActivityList data={data} />}

      <div className="h-24" />
      <Link
        to={`/g/${groupId}/expense/new`}
        className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand-700 px-6 py-3.5 font-semibold text-white shadow-lg hover:bg-brand-800"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        + Add expense
      </Link>
    </Screen>
  )
}

function useNames(data: GroupData) {
  return useMemo(() => new Map(data.members.map((m) => [m.id, m.display_name])), [data.members])
}

function ExpenseList({ data, myMemberId }: { data: GroupData; myMemberId?: string }) {
  const names = useNames(data)
  type Row =
    | { kind: 'expense'; date: string; created: string; item: GroupData['expenses'][number] }
    | { kind: 'settlement'; date: string; created: string; item: GroupData['settlements'][number] }
  const rows: Row[] = [
    ...data.expenses.map((e) => ({ kind: 'expense' as const, date: e.expense_date, created: e.created_at, item: e })),
    ...data.settlements.map((s) => ({ kind: 'settlement' as const, date: s.settled_on, created: s.created_at, item: s })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created))

  if (rows.length === 0) return <Empty>No expenses yet. Tap “Add expense” to add the first one.</Empty>

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => {
        if (row.kind === 'settlement') {
          const s = row.item
          return (
            <li key={s.id} className="flex items-center gap-3 py-3 text-sm text-slate-600">
              <span className="w-12 shrink-0 text-xs text-slate-400">{formatDate(s.settled_on)}</span>
              <span className="flex-1">
                💸 <strong>{names.get(s.from_member)}</strong> paid <strong>{names.get(s.to_member)}</strong>
                {s.note ? ` · ${s.note}` : ''}
              </span>
              <span className="font-medium">{formatINR(s.amount_paise)}</span>
            </li>
          )
        }
        const e = row.item
        const payer = e.expense_payers[0]
        const myShare = e.expense_splits.find((s) => s.member_id === myMemberId)?.amount_paise ?? 0
        const myPaid = e.expense_payers.find((p) => p.member_id === myMemberId)?.amount_paise ?? 0
        const mine = myPaid - myShare
        return (
          <li key={e.id}>
            <Link to={`/g/${e.group_id}/expense/${e.id}`} className="flex items-center gap-3 py-3">
              <span className="w-12 shrink-0 text-xs text-slate-400">{formatDate(e.expense_date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.description}</span>
                <span className="text-sm text-slate-500">
                  {payer ? names.get(payer.member_id) : '?'} paid {formatINR(e.amount_paise)}
                </span>
              </span>
              {mine === 0 ? (
                <span className="text-xs text-slate-400">not involved</span>
              ) : (
                <span className={`text-right text-sm ${mine > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  <span className="block text-xs">{mine > 0 ? 'you lent' : 'you borrowed'}</span>
                  <span className="font-semibold">{formatINR(Math.abs(mine))}</span>
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Balances({ data, myMemberId }: { data: GroupData; myMemberId?: string }) {
  const names = useNames(data)
  const active = data.members.filter((m) => !m.left_at)
  const transfers = useMemo(() => {
    const { expenses, settlements } = toBalanceInputs(data)
    return data.group.simplify_debts ? simplifyDebts(data.net) : pairwiseDebts(expenses, settlements)
  }, [data])

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-slate-100">
        {active.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <Avatar name={m.display_name} muted={!m.user_id} />
            <span className="flex-1 font-medium">
              {m.display_name}
              {m.id === myMemberId && <span className="text-slate-400"> (you)</span>}
            </span>
            <NetLabel net={data.net[m.id] ?? 0} />
          </li>
        ))}
      </ul>

      <section>
        <h3 className="mb-2 font-semibold text-slate-700">Who pays whom</h3>
        {transfers.length === 0 ? (
          <p className="text-slate-500">Everyone is settled up 🎉</p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => (
              <li key={`${t.from}-${t.to}`} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <strong>{names.get(t.from)}</strong> pays <strong>{names.get(t.to)}</strong>{' '}
                <span className="font-semibold">{formatINR(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {data.group.simplify_debts
            ? 'Debts are simplified to the fewest payments. Change this in Members.'
            : 'Showing debts between each pair of people.'}
        </p>
      </section>
    </div>
  )
}

function describe(a: Activity, names: Map<string, string>): string {
  const p = a.payload as Record<string, unknown>
  const amount = typeof p.amount_paise === 'number' ? formatINR(p.amount_paise) : ''
  switch (`${a.entity_type}:${a.action}`) {
    case 'group:created': return `created the group`
    case 'member:added': return `added ${p.name}`
    case 'member:joined': return `${p.name} joined`
    case 'member:claimed': return `joined as ${p.name}`
    case 'member:unclaimed': return `unlinked ${p.name}`
    case 'expense:created': return `added “${p.description}” (${amount})`
    case 'expense:updated': return `edited “${p.description}” (${amount})`
    case 'expense:deleted': return `deleted “${p.description}” (${amount})`
    case 'settlement:created':
      return `recorded ${names.get(String(p.from_member))} paid ${names.get(String(p.to_member))} ${amount}`
    case 'settlement:deleted': return `removed a payment of ${amount}`
    default: return `${a.action} ${a.entity_type}`
  }
}

function ActivityList({ data }: { data: GroupData }) {
  const names = useNames(data)
  const actorName = (actorId: string | null) =>
    data.members.find((m) => m.user_id === actorId)?.display_name ?? 'Someone'
  if (data.activity.length === 0) return <Empty>No activity yet.</Empty>
  return (
    <ul className="space-y-3">
      {data.activity.map((a) => (
        <li key={a.id} className="text-sm">
          <strong>{actorName(a.actor_id)}</strong> {describe(a, names)}
          <span className="block text-xs text-slate-400">{formatDateTime(a.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}
