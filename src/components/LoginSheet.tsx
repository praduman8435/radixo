import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/backend'
import { OTP_REQUIRED } from '../lib/config'
import { cleanPhone, formatPhone, friendlyAuthError, isValidPhone } from '../lib/phone'
import type { StayType } from '../lib/types'
import { Button, cx } from './ui'

type Step = 'phone' | 'otp' | 'name'
const STAYS: StayType[] = ['PG', 'Hostel', 'Rented flat', 'Day scholar']

/** Mobile number → OTP → (first time) name. Calls onDone once the student is logged in and named. */
export function LoginFlow({ reason, onDone, compact }: { reason?: string; onDone?: () => void; compact?: boolean }) {
  const { sendOtp, phoneLogin, refreshProfile, profile } = useAuth()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [stay, setStay] = useState<StayType>('PG')
  const [area, setArea] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])
  useEffect(() => {
    if (step === 'otp') codeRef.current?.focus()
  }, [step])

  async function submitPhone(e?: FormEvent) {
    e?.preventDefault()
    if (!isValidPhone(phone)) return setErr('Enter your 10-digit mobile number.')
    setBusy(true)
    setErr('')
    try {
      await sendOtp(cleanPhone(phone))
      setStep('otp')
      setResendIn(30)
    } catch (er) {
      setErr(friendlyAuthError(er))
    } finally {
      setBusy(false)
    }
  }

  async function verify(skip = false) {
    if (OTP_REQUIRED && !/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code.')
    setBusy(true)
    setErr('')
    try {
      const { isNew } = await phoneLogin(cleanPhone(phone), skip ? null : code)
      if (isNew) setStep('name')
      else onDone?.()
    } catch (er) {
      setErr(friendlyAuthError(er))
    } finally {
      setBusy(false)
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return setErr('Tell us your name.')
    setBusy(true)
    try {
      const u = await api.getUser()
      if (u) await api.update('profiles', u.id, { full_name: name.trim(), stay_type: stay, area: area.trim() })
      await refreshProfile()
      onDone?.()
    } catch (er) {
      setErr(friendlyAuthError(er))
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'phone' ? 'Log in with your number' : step === 'otp' ? 'Enter the code' : 'Welcome to Radixo!'

  return (
    <div className={cx('mx-auto w-full max-w-sm', compact ? '' : 'pt-2')}>
      <div className="flex items-center gap-3">
        {step === 'otp' && (
          <button type="button" onClick={() => { setStep('phone'); setCode(''); setErr('') }} className="grid size-9 place-items-center rounded-full hover:bg-sand" aria-label="Change number">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <img src="/radixo-chef-180.png" alt="" className="size-11" />
        <div>
          <h2 className="font-display text-[22px] font-bold leading-tight">{title}</h2>
          <p className="text-sm text-muted">
            {step === 'phone' ? (reason ?? 'No password needed. We’ll send a one-time code.') : step === 'otp' ? <>Sent to <span className="font-semibold text-ink">+91 {formatPhone(phone)}</span></> : 'One last thing, so the counter knows you.'}
          </p>
        </div>
      </div>

      {step === 'phone' && (
        <form onSubmit={submitPhone} className="mt-6" noValidate>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="login-phone">Mobile number</label>
          <div className={cx('mt-1.5 flex h-12 items-center gap-2 rounded-2xl border-2 bg-white px-4 transition-colors focus-within:border-brand', err ? 'border-brand' : 'border-line')}>
            <span className="font-semibold text-ink">+91</span>
            <span className="h-5 w-px bg-line" aria-hidden />
            <input
              id="login-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              maxLength={11}
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, '')); setErr('') }}
              className="h-full flex-1 bg-transparent text-[17px] font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-muted/60 focus-visible:outline-none"
            />
          </div>
          {err && <p className="mt-2 text-sm font-medium text-brand-600" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="mt-4 h-11 w-full rounded-xl">Get code</Button>
          <p className="mt-3 text-center text-xs text-muted">By continuing you agree to get meal and plan updates on this number.</p>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={(e) => { e.preventDefault(); void verify() }} className="mt-6" noValidate>
          {!OTP_REQUIRED && (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-turmeric-50 px-3 py-2.5 text-xs font-medium text-amber">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Testing mode: codes aren&rsquo;t sent yet, so any code works. You can also skip.
            </p>
          )}
          <div className="relative" onClick={() => codeRef.current?.focus()}>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); setErr(''); if (v.length === 6) setTimeout(() => void verify(), 50) }}
              className="absolute inset-0 opacity-0 focus-visible:outline-none"
              aria-label="6-digit code"
            />
            <div className="grid grid-cols-6 gap-2" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={cx('grid h-13 place-items-center rounded-xl border-2 font-display text-2xl font-bold transition-colors', code.length === i ? 'border-brand bg-brand-50/50' : code[i] ? 'border-ink/70' : 'border-line')}>
                  {code[i] ?? ''}
                </div>
              ))}
            </div>
          </div>
          {err && <p className="mt-2 text-sm font-medium text-brand-600" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="mt-4 h-11 w-full rounded-xl">Verify &amp; continue</Button>
          <div className="mt-3 flex items-center justify-between text-sm">
            <button type="button" disabled={resendIn > 0} onClick={() => submitPhone()} className="font-semibold text-brand disabled:text-muted">
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
            {!OTP_REQUIRED && <button type="button" onClick={() => verify(true)} disabled={busy} className="font-semibold text-ink/70 hover:text-ink">Skip for now →</button>}
          </div>
        </form>
      )}

      {step === 'name' && !profile?.full_name && (
        <form onSubmit={saveName} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="login-name">Your name</label>
            <input id="login-name" autoFocus autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="e.g. Aarav Gupta" className="mt-1.5 h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-[17px] font-semibold outline-none focus:border-brand focus-visible:outline-none" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Where do you stay?</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {STAYS.map((s) => (
                <button key={s} type="button" aria-pressed={stay === s} onClick={() => setStay(s)} className={cx('h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors', stay === s ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-muted/50')}>{s}</button>
              ))}
            </div>
          </div>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="PG name / area (optional)" aria-label="PG name or area" className="h-11 w-full rounded-xl border border-line bg-white px-4 text-[15px] outline-none focus:border-brand focus-visible:outline-none" />
          {err && <p className="text-sm font-medium text-brand-600" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="h-11 w-full rounded-xl">Start eating well</Button>
        </form>
      )}
    </div>
  )
}

// ---------- Gate: ask for login only when an action needs it ----------

interface Gate {
  /** Run `then` now if logged in, else open the login sheet and run it after login. */
  requireLogin(reason?: string, then?: () => void): void
}
const GateCtx = createContext<Gate>({ requireLogin: () => {} })
export const useLoginGate = () => useContext(GateCtx)

export function LoginGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [open, setOpen] = useState<{ reason?: string; then?: () => void } | null>(null)

  const requireLogin = useCallback((reason?: string, then?: () => void) => {
    if (user) then?.()
    else setOpen({ reason, then })
  }, [user])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <GateCtx.Provider value={{ requireLogin }}>
      {children}
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Log in">
          <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(null)} aria-label="Close" />
          <div className="sheet-up pb-safe relative w-full max-w-md rounded-t-[28px] border-t-[3px] border-maroon bg-cream px-6 pb-10 pt-3 shadow-pop sm:rounded-[28px] sm:border-[3px]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/15 sm:hidden" aria-hidden />
            <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full hover:bg-sand" aria-label="Close"><X className="size-5" /></button>
            <LoginFlow reason={open.reason} compact onDone={() => { const then = open.then; setOpen(null); then?.() }} />
          </div>
        </div>,
        document.body,
      )}
    </GateCtx.Provider>
  )
}
