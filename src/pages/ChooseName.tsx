import { useState, type FormEvent } from 'react'
import { useUpdateProfile, type Profile } from '../lib/api'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'

/** Shown once after a first email sign-in, so friends see a real name, not an email prefix. */
export default function ChooseName({ profile }: { profile: Profile }) {
  const update = useUpdateProfile(profile.id)
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    await update.mutateAsync(name.trim())
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-white px-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">What's your name?</h1>
        <p className="mt-2 text-slate-600">
          This is how friends will see you in groups. You can change it later in Account.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <input
            required
            autoFocus
            maxLength={60}
            autoComplete="name"
            className={inputClass}
            placeholder="e.g. Ravi"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <ErrorBox error={update.error} />
        <Button type="submit" className="w-full" loading={update.isPending} disabled={!name.trim()}>
          Continue
        </Button>
      </form>
    </div>
  )
}
