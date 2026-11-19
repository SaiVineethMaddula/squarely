import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toBalanceInputs, useDeleteSettlement, useGroup, useRecordSettlement, type GroupData } from '../lib/api'
import { useUserId } from '../lib/auth'
import { pairwiseDebts, simplifyDebts, type Transfer } from '../lib/balances'
import { formatDate, todayISO } from '../lib/dates'
import { formatINR, parseRupees } from '../lib/money'
import { Button, ErrorBox, Field, Loading, Screen, inputClass } from '../components/ui'

export default function SettleUpPage() {
  const { groupId = '' } = useParams()
  const { data, isPending, error } = useGroup(groupId)
  const back = `/g/${groupId}`
  if (isPending) return <Screen title="Settle up" back={back}><Loading /></Screen>
  if (error || !data) return <Screen title="Settle up" back={back}><ErrorBox error={error} /></Screen>
  return <SettleUp data={data} />
}

function SettleUp({ data }: { data: GroupData }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const groupId = data.group.id
  const record = useRecordSettlement(groupId)
  const remove = useDeleteSettlement(groupId)
  const names = new Map(data.members.map((m) => [m.id, m.display_name]))
  const active = data.members.filter((m) => !m.left_at)
  const me = data.members.find((m) => m.user_id === userId)

  const transfers = useMemo(() => {
    const { expenses, settlements } = toBalanceInputs(data)
    return data.group.simplify_debts ? simplifyDebts(data.net) : pairwiseDebts(expenses, settlements)
  }, [data])

  const [from, setFrom] = useState(me?.id ?? active[0]?.id ?? '')
  const [to, setTo] = useState(active.find((m) => m.id !== from)?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const amount = parseRupees(amountText)

  function pick(t: Transfer) {
    setFrom(t.from)
    setTo(t.to)
    setAmountText(String(t.amount / 100))
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amount) return
    await record.mutateAsync({ from, to, amountPaise: amount, date, note })
    navigate(`/g/${groupId}`, { replace: true })
  }

  return (
    <Screen title="Settle up" back={`/g/${groupId}`}>
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-slate-700">Suggested payments</h2>
        {transfers.length === 0 ? (
          <p className="text-slate-500">Everyone is settled up 🎉</p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => (
              <li key={`${t.from}-${t.to}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex-1">
                  <strong>{names.get(t.from)}</strong> pays <strong>{names.get(t.to)}</strong>{' '}
                  <span className="font-semibold">{formatINR(t.amount)}</span>
                </span>
                <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => pick(t)}>
                  Record
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Pay each other outside the app (cash, UPI, bank transfer), then record it here.
        </p>
      </section>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-700">Record a payment</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid">
            <select className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)}>
              {active.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
          <Field label="Paid to">
            <select className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
              {active.filter((m) => m.id !== from).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input required inputMode="decimal" className={inputClass} value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Date">
            <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input maxLength={100} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI" />
        </Field>
        <ErrorBox error={record.error} />
        <Button type="submit" className="w-full" loading={record.isPending} disabled={!amount || !to || from === to}>
          Record payment
        </Button>
      </form>

      {data.settlements.length > 0 && (
        <section className="mt-6 pb-4">
          <h2 className="mb-2 font-semibold text-slate-700">Past payments</h2>
          <ErrorBox error={remove.error} />
          <ul className="divide-y divide-slate-100">
            {data.settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2.5 text-sm">
                <span className="w-12 text-xs text-slate-400">{formatDate(s.settled_on)}</span>
                <span className="flex-1">
                  {names.get(s.from_member)} → {names.get(s.to_member)} <strong>{formatINR(s.amount_paise)}</strong>
                </span>
                {s.created_by === userId && (
                  <button
                    className="text-xs text-red-700"
                    onClick={() => confirm('Remove this payment?') && remove.mutate(s.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}
