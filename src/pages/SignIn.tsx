import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'

const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE === 'true'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Come back to the same page (e.g. an invite link) after the magic link.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) setError(error)
    else setStep('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(error)
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) setError(error)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 bg-white px-6">
      <div className="text-center">
        <img src="/pwa-192x192.png" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
        <h1 className="text-3xl font-bold text-brand-800">Squarely</h1>
        <p className="mt-2 text-slate-600">Split group expenses. See who owes whom.</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" className="w-full" loading={busy}>
            Email me a sign-in code
          </Button>
          {googleEnabled && (
            <Button type="button" variant="secondary" className="w-full" onClick={google}>
              Continue with Google
            </Button>
          )}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-slate-600">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below, or tap the link in
            the email.
          </p>
          <Field label="Sign-in code">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" className="w-full" loading={busy}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('email')}>
            Use a different email
          </Button>
        </form>
      )}
    </div>
  )
}
