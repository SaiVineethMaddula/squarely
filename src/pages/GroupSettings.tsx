import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useAddPlaceholder,
  useDeleteGroup,
  useGroup,
  useLeaveGroup,
  useRemoveMember,
  useUnclaimMember,
  useUpdateGroup,
  type GroupData,
} from '../lib/api'
import { formatINR } from '../lib/money'
import { useUserId } from '../lib/auth'
import { Avatar, Button, ErrorBox, Loading, Screen, inputClass } from '../components/ui'

export default function GroupSettingsPage() {
  const { groupId = '' } = useParams()
  const { data, isPending, error } = useGroup(groupId)
  const back = `/g/${groupId}`
  if (isPending) return <Screen title="Members" back={back}><Loading /></Screen>
  if (error || !data) return <Screen title="Members" back={back}><ErrorBox error={error} /></Screen>
  return <GroupSettings data={data} />
}

function GroupSettings({ data }: { data: GroupData }) {
  const userId = useUserId()
  const groupId = data.group.id
  const addPlaceholder = useAddPlaceholder(groupId)
  const unclaim = useUnclaimMember(groupId)
  const removeMember = useRemoveMember(groupId)
  const leave = useLeaveGroup(groupId)
  const navigate = useNavigate()
  const updateGroup = useUpdateGroup(groupId)
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState(false)

  const me = data.members.find((m) => m.user_id === userId)
  const isAdmin = me?.role === 'admin'
  const active = data.members.filter((m) => !m.left_at)
  const inviteUrl = `${window.location.origin}/join/${data.group.invite_code}`
  const myNet = me ? (data.net[me.id] ?? 0) : 0
  const othersJoined = active.some((m) => m.user_id && m.id !== me?.id)

  async function onLeave() {
    if (!confirm(`Leave “${data.group.name}”? You can rejoin later with the invite link.`)) return
    await leave.mutateAsync()
    navigate('/', { replace: true })
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    await addPlaceholder.mutateAsync(newName.trim())
    setNewName('')
  }

  async function share() {
    const text = `Join "${data.group.name}" on Squarely to split expenses: ${inviteUrl}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Squarely', text, url: inviteUrl })
        return
      } catch {
        // User cancelled or share failed; fall back to copying.
      }
    }
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Screen title="Members" back={`/g/${groupId}`}>
      <section className="mb-6 rounded-2xl bg-brand-50 p-4">
        <h2 className="font-semibold text-brand-800">Invite friends</h2>
        <p className="mt-1 text-sm text-brand-800">
          Share this link. When friends join, they can pick their name from the list below.
        </p>
        <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-700">{inviteUrl}</p>
        <Button className="mt-3 w-full" onClick={share}>
          {copied ? 'Link copied!' : 'Share invite link'}
        </Button>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-slate-700">People ({active.length})</h2>
        <ul className="divide-y divide-slate-100">
          {active.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.display_name} muted={!m.user_id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.display_name}
                  {m.id === me?.id && <span className="text-slate-400"> (you)</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {m.role === 'admin' ? 'Admin' : m.user_id ? 'Joined' : 'Not joined yet'}
                </span>
              </span>
              {isAdmin && m.id !== me?.id && (
                <span className="flex shrink-0 gap-3">
                  {m.user_id && (
                    <button
                      className="text-xs text-slate-500 underline"
                      onClick={() =>
                        confirm(`Unlink ${m.display_name}'s account? Use this if the wrong person picked this name. Their expenses stay.`) &&
                        unclaim.mutate(m.id)
                      }
                    >
                      Unlink
                    </button>
                  )}
                  <button
                    className="text-xs text-red-700 underline disabled:text-slate-300 disabled:no-underline"
                    disabled={(data.net[m.id] ?? 0) !== 0}
                    title={(data.net[m.id] ?? 0) !== 0 ? 'Settle up first' : undefined}
                    onClick={() =>
                      confirm(`Remove ${m.display_name} from the group? Their past expenses stay, marked “(left)”.`) &&
                      removeMember.mutate(m.id)
                    }
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <ErrorBox error={unclaim.error ?? removeMember.error} />
        {isAdmin && active.some((m) => m.id !== me?.id && (data.net[m.id] ?? 0) !== 0) && (
          <p className="mt-1 text-xs text-slate-500">People can be removed once their balance is ₹0.</p>
        )}

        <form onSubmit={add} className="mt-3 flex gap-2">
          <input
            required
            maxLength={60}
            className={inputClass}
            placeholder="Add someone by name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" loading={addPlaceholder.isPending}>Add</Button>
        </form>
        <p className="mt-1 text-xs text-slate-500">
          You can add friends before they sign up and include them in expenses straight away.
        </p>
        <ErrorBox error={addPlaceholder.error} />
      </section>

      {isAdmin && <AdminSettings data={data} update={updateGroup} />}

      <section className="space-y-3 border-t border-slate-200 pt-4 pb-8">
        <h2 className="font-semibold text-slate-700">Leave group</h2>
        {myNet !== 0 ? (
          <p className="text-sm text-slate-600">
            You can leave once you're settled up. You {myNet > 0 ? 'get back' : 'owe'}{' '}
            <strong>{formatINR(Math.abs(myNet))}</strong> in this group.
          </p>
        ) : !othersJoined ? (
          <p className="text-sm text-slate-600">
            Nobody else has joined yet{isAdmin ? ', so delete the group instead of leaving it.' : '.'}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            The group disappears from your list. Your past expenses stay, marked “(left)”.
            {isAdmin && !active.some((m) => m.role === 'admin' && m.id !== me?.id) &&
              ' Someone else will become the admin.'}
          </p>
        )}
        <ErrorBox error={leave.error} />
        <Button variant="danger" className="w-full" onClick={onLeave} loading={leave.isPending} disabled={myNet !== 0 || !othersJoined}>
          Leave group
        </Button>
        {isAdmin && <DeleteGroup data={data} />}
      </section>
    </Screen>
  )
}

function AdminSettings({ data, update }: { data: GroupData; update: ReturnType<typeof useUpdateGroup> }) {
  const [name, setName] = useState(data.group.name)
  return (
    <section className="space-y-4 border-t border-slate-200 pt-4 pb-6">
      <h2 className="font-semibold text-slate-700">Group settings</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ name: name.trim() })
        }}
      >
        <input required maxLength={60} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={name.trim() === data.group.name}>Rename</Button>
      </form>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-brand-700"
          checked={data.group.simplify_debts}
          onChange={(e) => update.mutate({ simplify_debts: e.target.checked })}
        />
        <span>
          <span className="block font-medium">Simplify debts</span>
          <span className="text-sm text-slate-500">
            Combine debts so the group needs the fewest payments. Turn off to only pay people you shared costs with.
          </span>
        </span>
      </label>
      <ErrorBox error={update.error} />
    </section>
  )
}

function DeleteGroup({ data }: { data: GroupData }) {
  const remove = useDeleteGroup(data.group.id)
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const unsettled = data.members.filter((m) => (data.net[m.id] ?? 0) !== 0)

  async function onDelete() {
    await remove.mutateAsync()
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-3 pt-4">
      <h2 className="font-semibold text-red-800">Delete group</h2>
      {unsettled.length > 0 ? (
        <p className="text-sm text-slate-600">
          Everyone must be settled up first. Still to settle:{' '}
          <strong>{unsettled.map((m) => m.display_name).join(', ')}</strong>.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Permanently deletes this group with all its expenses, payments and history, for everyone.
          This cannot be undone.
        </p>
      )}
      {open && unsettled.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <label className="block text-sm text-red-900">
            Type <strong>{data.group.name}</strong> to confirm
            <input
              className={`${inputClass} mt-1`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <ErrorBox error={remove.error} />
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-red-700 hover:bg-red-800"
              disabled={typed.trim() !== data.group.name}
              loading={remove.isPending}
              onClick={onDelete}
            >
              Delete forever
            </Button>
            <Button variant="secondary" onClick={() => { setOpen(false); setTyped('') }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" className="w-full" disabled={unsettled.length > 0} onClick={() => setOpen(true)}>
          Delete group…
        </Button>
      )}
    </div>
  )
}
