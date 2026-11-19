import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile, useUpdateProfile } from '../lib/api'
import { useAuth, useUserId } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Button, ErrorBox, Field, Loading, Screen, inputClass } from '../components/ui'

export default function Account() {
  const userId = useUserId()
  const { session } = useAuth()
  const profile = useProfile(userId)
  const queryClient = useQueryClient()

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  return (
    <Screen title="Account" back="/">
      {profile.data ? (
        <NameForm userId={userId} initial={profile.data.display_name} />
      ) : profile.error ? (
        <ErrorBox error={profile.error} />
      ) : (
        <Loading />
      )}
      <p className="mt-6 text-sm text-slate-500">Signed in as {session?.user.email}</p>
      <Button variant="secondary" className="mt-3 w-full" onClick={signOut}>
        Sign out
      </Button>
    </Screen>
  )
}

function NameForm({ userId, initial }: { userId: string; initial: string }) {
  const update = useUpdateProfile(userId)
  const [name, setName] = useState(initial)
  async function submit(e: FormEvent) {
    e.preventDefault()
    await update.mutateAsync(name.trim())
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Your name" hint="Shown to people in your groups. New groups you create or join use this name.">
        <input required maxLength={60} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <ErrorBox error={update.error} />
      {update.isSuccess && <p className="text-sm text-emerald-700">Saved.</p>}
      <Button type="submit" loading={update.isPending} disabled={name.trim() === initial}>
        Save
      </Button>
    </form>
  )
}
