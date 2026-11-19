import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDeleteExpense, useGroup, useSaveExpense, type Expense, type GroupData } from '../lib/api'
import { useUserId } from '../lib/auth'
import { todayISO } from '../lib/dates'
import { formatINR, parseRupees } from '../lib/money'
import { computeSplit, type SplitInput } from '../lib/splits'
import { Button, ErrorBox, Field, Loading, Screen, inputClass } from '../components/ui'

type SplitType = SplitInput['type']

const CATEGORIES = ['Food', 'Transport', 'Stay', 'Groceries', 'Rent', 'Bills', 'Shopping', 'Fun', 'Other']

const SPLIT_LABELS: Record<SplitType, string> = {
  equal: 'Equally',
  exact: 'Exact ₹',
  percent: 'Percent',
  shares: 'Shares',
}

export default function ExpenseFormPage() {
  const { groupId = '', expenseId } = useParams()
  const { data, isPending, error } = useGroup(groupId)
  const back = `/g/${groupId}`

  if (isPending) return <Screen title="" back={back}><Loading /></Screen>
  if (error || !data) return <Screen title="Expense" back={back}><ErrorBox error={error} /></Screen>

  const existing = expenseId ? data.expenses.find((e) => e.id === expenseId) : undefined
  if (expenseId && !existing) {
    return <Screen title="Expense" back={back}><ErrorBox error={{ message: 'This expense was deleted.' }} /></Screen>
  }
  return <ExpenseForm data={data} existing={existing} key={existing?.updated_at ?? 'new'} />
}

function ExpenseForm({ data, existing }: { data: GroupData; existing?: Expense }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const groupId = data.group.id
  const save = useSaveExpense(groupId)
  const remove = useDeleteExpense(groupId)

  // Members who can be on a new expense, plus anyone already on this one.
  const members = data.members.filter(
    (m) =>
      !m.left_at ||
      existing?.expense_splits.some((s) => s.member_id === m.id) ||
      existing?.expense_payers.some((p) => p.member_id === m.id),
  )
  const me = data.members.find((m) => m.user_id === userId)
  const canEdit = !existing || existing.created_by === userId
  const creatorName =
    data.members.find((m) => m.user_id === existing?.created_by)?.display_name ?? 'someone else'

  const [description, setDescription] = useState(existing?.description ?? '')
  const [amountText, setAmountText] = useState(existing ? String(existing.amount_paise / 100) : '')
  const [date, setDate] = useState(existing?.expense_date ?? todayISO())
  const [category, setCategory] = useState(existing?.category ?? '')
  const [payer, setPayer] = useState(existing?.expense_payers[0]?.member_id ?? me?.id ?? members[0]?.id ?? '')
  const [splitType, setSplitType] = useState<SplitType>((existing?.split_type as SplitType) ?? 'equal')

  // Equal: who's included. Others: a value per member (₹, %, or shares).
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(existing ? existing.expense_splits.filter((s) => s.amount_paise > 0 || s.share_input).map((s) => s.member_id) : members.filter((m) => !m.left_at).map((m) => m.id)),
  )
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!existing) return {}
    return Object.fromEntries(
      existing.expense_splits.map((s) => [
        s.member_id,
        existing.split_type === 'exact' ? String(s.amount_paise / 100) : String(s.share_input ?? ''),
      ]),
    )
  })

  const amount = parseRupees(amountText)

  const preview = useMemo(() => {
    if (!amount) return { error: null as string | null, result: null as Record<string, number> | null, assigned: 0 }
    let split: SplitInput
    let assigned = 0
    const num = (id: string) => Number(values[id] || 0)
    if (splitType === 'equal') {
      split = { type: 'equal', members: members.map((m) => m.id).filter((id) => included.has(id)) }
    } else if (splitType === 'exact') {
      const amounts: Record<string, number> = {}
      for (const m of members) {
        const p = values[m.id] ? parseRupees(values[m.id]) : 0
        if (p === null) return { error: `Check the amount for ${m.display_name}`, result: null, assigned }
        amounts[m.id] = p
        assigned += p
      }
      split = { type: 'exact', amounts }
    } else if (splitType === 'percent') {
      split = { type: 'percent', percents: Object.fromEntries(members.map((m) => [m.id, num(m.id)])) }
      assigned = members.reduce((s, m) => s + num(m.id), 0)
    } else {
      split = { type: 'shares', shares: Object.fromEntries(members.map((m) => [m.id, num(m.id)])) }
    }
    try {
      return { error: null, result: computeSplit(amount, split), split, assigned }
    } catch (e) {
      return { error: (e as Error).message, result: null, assigned }
    }
  }, [amount, splitType, values, included, members])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amount || !preview.result || !('split' in preview) || !preview.split) return
    await save.mutateAsync({
      expenseId: existing?.id,
      input: {
        description: description.trim(),
        amountPaise: amount,
        date,
        category,
        split: preview.split,
        payerMemberId: payer,
        splitAmounts: preview.result,
      },
    })
    navigate(`/g/${groupId}`, { replace: true })
  }

  async function onDelete() {
    if (!existing || !confirm(`Delete “${existing.description}”? It will be removed from everyone's balances.`)) return
    await remove.mutateAsync(existing.id)
    navigate(`/g/${groupId}`, { replace: true })
  }

  const disabled = !canEdit
  const valueSuffix = splitType === 'exact' ? '₹' : splitType === 'percent' ? '%' : '×'

  return (
    <Screen title={existing ? (canEdit ? 'Edit expense' : 'Expense') : 'Add expense'} back={`/g/${groupId}`}>
      {!canEdit && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only {creatorName}, who added this expense, can edit it.
        </p>
      )}
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={disabled} className="space-y-5">
          <Field label="Amount (₹)">
            <input
              required
              inputMode="decimal"
              autoFocus={!existing}
              className={`${inputClass} text-2xl font-semibold`}
              placeholder="0"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {amountText && !amount && <span className="mt-1 block text-sm text-red-700">Enter a valid amount, e.g. 450 or 99.50</span>}
          </Field>

          <Field label="What was it for?">
            <input
              required
              maxLength={100}
              className={inputClass}
              placeholder="e.g. Dinner at Thalassa"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Date">
              <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Category">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">None</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Paid by">
            <select className={inputClass} value={payer} onChange={(e) => setPayer(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === me?.id ? `${m.display_name} (you)` : m.display_name}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-600">Split</span>
            <div className="mb-3 grid grid-cols-4 rounded-xl bg-slate-100 p-1 text-sm">
              {(Object.keys(SPLIT_LABELS) as SplitType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setSplitType(t)}
                  className={`rounded-lg py-2 ${splitType === t ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
                >
                  {SPLIT_LABELS[t]}
                </button>
              ))}
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  {splitType === 'equal' ? (
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-700"
                        checked={included.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(included)
                          if (e.target.checked) next.add(m.id)
                          else next.delete(m.id)
                          setIncluded(next)
                        }}
                      />
                      <span className="flex-1">{m.display_name}</span>
                    </label>
                  ) : (
                    <>
                      <span className="flex-1">{m.display_name}</span>
                      <span className="text-sm text-slate-400">{valueSuffix}</span>
                      <input
                        inputMode="decimal"
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right"
                        placeholder="0"
                        value={values[m.id] ?? ''}
                        onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                      />
                    </>
                  )}
                  <span className="w-20 text-right text-sm text-slate-500">
                    {preview.result?.[m.id] ? formatINR(preview.result[m.id]) : '–'}
                  </span>
                </li>
              ))}
            </ul>

            {amount && splitType === 'exact' && (
              <p className="mt-2 text-sm text-slate-600">
                {formatINR(preview.assigned)} of {formatINR(amount)} assigned ·{' '}
                <strong>{formatINR(amount - preview.assigned)} left</strong>
              </p>
            )}
            {amount && splitType === 'percent' && (
              <p className="mt-2 text-sm text-slate-600">
                {Math.round(preview.assigned * 100) / 100}% of 100% assigned
              </p>
            )}
            {preview.error && splitType !== 'exact' && splitType !== 'percent' && (
              <p className="mt-2 text-sm text-red-700">{preview.error}</p>
            )}
          </div>
        </fieldset>

        <ErrorBox error={save.error ?? remove.error} />

        {canEdit && (
          <div className="flex gap-2 pb-4">
            <Button type="submit" className="flex-1" loading={save.isPending} disabled={!amount || !preview.result || !description.trim()}>
              {existing ? 'Save changes' : 'Add expense'}
            </Button>
            {existing && (
              <Button type="button" variant="danger" onClick={onDelete} loading={remove.isPending}>
                Delete
              </Button>
            )}
          </div>
        )}
      </form>
    </Screen>
  )
}
