import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatINR } from '../lib/money'
import { errorMessage } from '../lib/supabase'

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none ' +
  'focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100'

export function Screen({
  title,
  back,
  right,
  children,
}: {
  title: ReactNode
  back?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-white shadow-sm">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3">
          {back && (
            <Link to={back} aria-label="Back" className="rounded-full p-2 text-slate-600 hover:bg-slate-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
          {right}
        </div>
      </header>
      <main className="safe-bottom flex-1 px-4 pt-4">{children}</main>
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-brand-700 hover:bg-brand-50',
}

export function Button({
  variant = 'primary',
  className = '',
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`rounded-xl px-4 py-2.5 font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-slate-500">{hint}</span>}
    </label>
  )
}

export function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        muted ? 'border border-dashed border-slate-400 text-slate-500' : 'bg-brand-100 text-brand-800'
      }`}
    >
      {initials || '?'}
    </span>
  )
}

/** A balance shown from one person's point of view. */
export function NetLabel({ net, you }: { net: number; you?: boolean }) {
  if (net === 0) return <span className="text-sm text-slate-500">settled up</span>
  const owed = net > 0
  return (
    <span className={`text-right text-sm ${owed ? 'text-emerald-700' : 'text-red-700'}`}>
      <span className="block text-xs">
        {you ? (owed ? 'you get back' : 'you owe') : owed ? 'gets back' : 'owes'}
      </span>
      <span className="font-semibold">{formatINR(Math.abs(net))}</span>
    </span>
  )
}

export function Loading() {
  return <p className="py-10 text-center text-slate-500">Loading…</p>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage(error)}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-slate-500">{children}</p>
}
