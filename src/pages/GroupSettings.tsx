import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAddPlaceholder, useGroup, useUnclaimMember, useUpdateGroup, type GroupData } from '../lib/api'
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
  const updateGroup = useUpdateGroup(groupId)
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState(false)

  const me = data.members.find((m) => m.user_id === userId)
  const isAdmin = me?.role === 'admin'
  const active = data.members.filter((m) => !m.left_at)
  const inviteUrl = `${window.location.origin}/join/${data.group.invite_code}`

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
              {isAdmin && m.user_id && m.id !== me?.id && (
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
            </li>
          ))}
        </ul>
        <ErrorBox error={unclaim.error} />

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
