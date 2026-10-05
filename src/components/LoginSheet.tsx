import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/backend'
import { OTP_REQUIRED } from '../lib/config'
import { cleanPhone, formatPhone, friendlyAuthError, isValidPhone } from '../lib/phone'
import { STAY_LABEL, type StayType } from '../lib/types'
import { Button, cx } from './ui'

type Step = 'phone' | 'otp' | 'name'
const STAYS: StayType[] = ['PG', 'Hostel', 'Rented flat', 'Day scholar']

/** Mobile number → OTP → (first time) name. Calls onDone once the student is logged in and named. */
export function LoginFlow({ reason, onDone, compact, dark, hideLogo }: { reason?: string; onDone?: () => void; compact?: boolean; dark?: boolean; hideLogo?: boolean }) {
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

  const title = step === 'phone' ? 'Log in with your number' : step === 'otp' ? 'Enter the code' : 'Welcome to Radixo Dining'
  // Two looks: dark (login sheet, login page) and light (inline on light pages).
  const T = dark
    ? {
        title: 'text-white', sub: 'text-white/55', strong: 'text-white', label: 'text-white/45',
        field: 'bg-white/[0.06] ring-1 ring-white/12 focus-within:ring-2 focus-within:ring-brand', fieldErr: 'ring-2 ring-brand',
        input: 'text-white placeholder:text-white/30', divider: 'bg-white/15', note: 'text-white/40',
        box: 'bg-white/[0.06] ring-1 ring-white/12', boxOn: 'ring-2 ring-brand bg-brand/10', boxFilled: 'ring-1 ring-white/40',
        link: 'text-turmeric', muted: 'text-white/40', skip: 'text-white/70 hover:text-white', back: 'text-white hover:bg-white/10',
        chip: 'bg-white/[0.06] text-white/80 ring-1 ring-white/12 hover:bg-white/10', chipOn: 'bg-brand text-white ring-0',
        test: 'bg-turmeric/10 text-turmeric ring-1 ring-turmeric/25', err: 'text-[#ff8a7a]',
      }
    : {
        title: 'text-ink', sub: 'text-muted', strong: 'text-ink', label: 'text-muted',
        field: 'bg-white ring-1 ring-line focus-within:ring-2 focus-within:ring-brand', fieldErr: 'ring-2 ring-brand',
        input: 'text-ink placeholder:text-muted/60', divider: 'bg-line', note: 'text-muted',
        box: 'bg-white ring-1 ring-line', boxOn: 'ring-2 ring-brand bg-brand-50/50', boxFilled: 'ring-1 ring-ink/50',
        link: 'text-brand', muted: 'text-muted', skip: 'text-ink/70 hover:text-ink', back: 'hover:bg-sand',
        chip: 'bg-white text-ink ring-1 ring-line hover:ring-muted/50', chipOn: 'bg-brand text-white ring-0',
        test: 'bg-turmeric-50 text-amber', err: 'text-brand-600',
      }
  const inputBase = 'h-full min-w-0 flex-1 bg-transparent font-semibold outline-none focus:outline-none focus-visible:outline-none'
  const primary = 'mt-5 h-11 w-full rounded-full text-[15px]'

  return (
    <div className={cx('mx-auto w-full max-w-sm', compact ? '' : 'pt-2')}>
      <div className={cx('flex items-start gap-3', !hideLogo && 'pr-10')}>
        {step === 'otp' && (
          <button type="button" onClick={() => { setStep('phone'); setCode(''); setErr('') }} className={cx('-ml-1 mt-1 grid size-9 shrink-0 place-items-center rounded-full', T.back)} aria-label="Change number">
            <ArrowLeft className="size-5" />
          </button>
        )}
        {step !== 'otp' && !hideLogo && <img src="/radixo-chef-180.png" alt="" className="size-12 shrink-0 drop-shadow-md" />}
        <div className="min-w-0">
          <h2 className={cx('text-[20px] font-bold leading-tight', T.title)}>{title}</h2>
          <p className={cx('mt-1 text-sm leading-snug', T.sub)}>
            {step === 'phone' ? (reason ?? 'No password needed. We’ll send a one-time code.') : step === 'otp' ? <>Sent to <span className={cx('font-semibold', T.strong)}>+91 {formatPhone(phone)}</span></> : 'One last thing, so the counter knows you.'}
          </p>
        </div>
      </div>

      {step === 'phone' && (
        <form onSubmit={submitPhone} className="mt-6" noValidate>
          <label className={cx('block text-[11px] font-semibold uppercase tracking-[0.12em]', T.label)} htmlFor="login-phone">Mobile number</label>
          <div className={cx('mt-2 flex h-12 items-center gap-3 rounded-xl px-4 transition-shadow', T.field, err && T.fieldErr)}>
            <span className={cx('flex items-center gap-1.5 text-[15px] font-semibold', T.strong)}><span aria-hidden>🇮🇳</span> +91</span>
            <span className={cx('h-5 w-px', T.divider)} aria-hidden />
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
              className={cx(inputBase, 'text-[17px] tracking-wide placeholder:font-normal', T.input)}
            />
          </div>
          {err && <p className={cx('mt-2 text-sm font-medium', T.err)} role="alert">{err}</p>}
          <Button type="submit" loading={busy} className={primary}>Get code</Button>
          <p className={cx('mt-3 text-center text-xs', T.note)}>We&rsquo;ll only message you about your meals and bookings.</p>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={(e) => { e.preventDefault(); void verify() }} className="mt-6" noValidate>
          {!OTP_REQUIRED && (
            <p className={cx('mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-medium', T.test)}>
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
              className="absolute inset-0 opacity-0 outline-none focus:outline-none focus-visible:outline-none"
              aria-label="6-digit code"
            />
            <div className="grid grid-cols-6 gap-2" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={cx('grid h-13 place-items-center rounded-xl text-2xl font-bold transition-all', code.length === i ? T.boxOn : code[i] ? T.boxFilled : T.box, T.strong)}>
                  {code[i] ?? ''}
                </div>
              ))}
            </div>
          </div>
          {err && <p className={cx('mt-2 text-sm font-medium', T.err)} role="alert">{err}</p>}
          <Button type="submit" loading={busy} className={primary}>Verify &amp; continue</Button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" disabled={resendIn > 0} onClick={() => submitPhone()} className={cx('font-semibold', resendIn > 0 ? T.muted : T.link)}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
            {!OTP_REQUIRED && <button type="button" onClick={() => verify(true)} disabled={busy} className={cx('font-semibold', T.skip)}>Skip for now →</button>}
          </div>
        </form>
      )}

      {step === 'name' && !profile?.full_name && (
        <form onSubmit={saveName} className="mt-6 space-y-5" noValidate>
          <div>
            <label className={cx('block text-[11px] font-semibold uppercase tracking-[0.12em]', T.label)} htmlFor="login-name">Your name</label>
            <div className={cx('mt-2 flex h-12 items-center rounded-xl px-4', T.field)}>
              <input id="login-name" autoFocus autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="e.g. Aarav Gupta" className={cx(inputBase, 'text-[16px]', T.input)} />
            </div>
          </div>
          <div>
            <p className={cx('text-[11px] font-semibold uppercase tracking-[0.12em]', T.label)}>Where do you live?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STAYS.map((st) => (
                <button key={st} type="button" aria-pressed={stay === st} onClick={() => setStay(st)} className={cx('h-9 rounded-full px-3.5 text-sm font-semibold transition-colors', stay === st ? T.chipOn : T.chip)}>{STAY_LABEL[st]}</button>
              ))}
            </div>
          </div>
          <div className={cx('flex h-11 items-center rounded-xl px-4', T.field)}>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="PG name / area (optional)" aria-label="PG name or area" className={cx(inputBase, 'text-[15px] font-medium', T.input)} />
          </div>
          {err && <p className={cx('text-sm font-medium', T.err)} role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="h-11 w-full rounded-full text-[15px]">Take me to my table</Button>
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
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={() => setOpen(null)} aria-label="Close" />
          <div className="sheet-up no-scrollbar relative max-h-[92dvh] w-full max-w-md overflow-y-auto overflow-x-hidden rounded-t-[28px] bg-[#141010] px-6 pt-3 text-white shadow-pop ring-1 ring-white/10 sm:rounded-[28px]" style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}>
            <span className="bg-brand-grad absolute inset-x-0 top-0 h-[3px]" aria-hidden />
            <span className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.35),transparent_65%)]" aria-hidden />
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
            <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-5 z-10 grid size-8 place-items-center rounded-full bg-white/[0.07] text-white/80 hover:bg-white/15" aria-label="Close"><X className="size-4" /></button>
            <div className="relative"><LoginFlow dark reason={open.reason} compact onDone={() => { const then = open.then; setOpen(null); then?.() }} /></div>
          </div>
        </div>,
        document.body,
      )}
    </GateCtx.Provider>
  )
}
