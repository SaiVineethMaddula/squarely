import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useInvitePreview, useJoinGroup } from '../lib/api'
import { Button, ErrorBox, Loading, Screen } from '../components/ui'

export default function Join() {
  const { code = '' } = useParams()
  const preview = useInvitePreview(code)
  const join = useJoinGroup()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<string>('new')

  if (preview.isPending) return <Screen title="Join group"><Loading /></Screen>
  if (preview.error || !preview.data) {
    return (
      <Screen title="Join group" back="/">
        <ErrorBox error={preview.error ?? { message: 'This invite link is not valid.' }} />
      </Screen>
    )
  }
  const p = preview.data
  if (p.already_member) return <Navigate to={`/g/${p.group_id}`} replace />

  async function submit() {
    const groupId = await join.mutateAsync({
      code,
      claimMemberId: choice === 'new' ? undefined : choice,
    })
    navigate(`/g/${groupId}`, { replace: true })
  }

  return (
    <Screen title="Join group" back="/">
      <h2 className="text-2xl font-bold">{p.name}</h2>
      <p className="mt-1 mb-6 text-slate-600">You've been invited to split expenses in this group.</p>

      {p.placeholders.length > 0 && (
        <fieldset className="mb-6">
          <legend className="mb-2 font-medium">Are you one of these people?</legend>
          <p className="mb-3 text-sm text-slate-500">
            Someone may have added you already. Pick your name to see the expenses you're part of.
          </p>
          <div className="space-y-2">
            {p.placeholders.map((ph) => (
              <label key={ph.id} className={`flex items-center gap-3 rounded-xl border p-3 ${choice === ph.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <input type="radio" name="who" className="accent-brand-700" checked={choice === ph.id} onChange={() => setChoice(ph.id)} />
                I'm <strong>{ph.display_name}</strong>
              </label>
            ))}
            <label className={`flex items-center gap-3 rounded-xl border p-3 ${choice === 'new' ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="who" className="accent-brand-700" checked={choice === 'new'} onChange={() => setChoice('new')} />
              None of these, join as myself
            </label>
          </div>
        </fieldset>
      )}

      <ErrorBox error={join.error} />
      <Button className="mt-2 w-full" onClick={submit} loading={join.isPending}>
        Join {p.name}
      </Button>
    </Screen>
  )
}
