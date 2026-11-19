import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateGroup, useMyGroups } from '../lib/api'
import { useUserId } from '../lib/auth'
import { formatINR } from '../lib/money'
import { Button, Empty, ErrorBox, Loading, NetLabel, Screen, inputClass } from '../components/ui'

export default function Home() {
  const userId = useUserId()
  const groups = useMyGroups(userId)
  const createGroup = useCreateGroup()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const list = groups.data ?? []
  const owed = list.filter((g) => g.myNet > 0).reduce((s, g) => s + g.myNet, 0)
  const owe = list.filter((g) => g.myNet < 0).reduce((s, g) => s - g.myNet, 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const id = await createGroup.mutateAsync(name.trim())
    navigate(`/g/${id}/settings`)
  }

  return (
    <Screen
      title="Squarely"
      right={
        <Link to="/account" className="rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
          Account
        </Link>
      }
    >
      <section className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">You are owed</p>
          <p className="text-xl font-bold text-emerald-800">{formatINR(owed)}</p>
        </div>
        <div className="rounded-2xl bg-red-50 p-4">
          <p className="text-sm text-red-800">You owe</p>
          <p className="text-xl font-bold text-red-800">{formatINR(owe)}</p>
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Your groups</h2>
        {!creating && (
          <Button variant="ghost" className="px-2 py-1" onClick={() => setCreating(true)}>
            + New group
          </Button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-slate-200 p-4">
          <input
            autoFocus
            required
            maxLength={60}
            className={inputClass}
            placeholder="e.g. Goa Trip, Flat 4B"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ErrorBox error={createGroup.error} />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={createGroup.isPending}>
              Create group
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {groups.isPending ? (
        <Loading />
      ) : groups.error ? (
        <ErrorBox error={groups.error} />
      ) : list.length === 0 && !creating ? (
        <Empty>
          No groups yet. Create one for your next trip or your flat, then share the invite link.
        </Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map(({ group, myNet, memberCount }) => (
            <li key={group.id}>
              <Link to={`/g/${group.id}`} className="flex items-center gap-3 py-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700">
                  {group.name[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{group.name}</span>
                  <span className="text-sm text-slate-500">{memberCount} people</span>
                </span>
                <NetLabel net={myNet} you />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
