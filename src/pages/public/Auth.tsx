import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LogOut, MessageCircle, ScanLine, Store, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api, isDemo } from '../../lib/backend'
import { DEMO_PASSWORD, DEMO_PHONES } from '../../lib/backend/seed'
import { useAsync } from '../../lib/useAsync'
import { loadSettings } from '../../lib/data'
import { cleanPhone, formatPhone, friendlyAuthError, isValidPhone } from '../../lib/phone'
import type { Role } from '../../lib/types'
import { Button, Modal, cx } from '../../components/ui'
import { LoginFlow } from '../../components/LoginSheet'

type LoginRole = 'user' | 'owner' | 'staff'

const ROLE_COPY: Record<LoginRole, { title: string; heading: string; allowed: Role[]; deny: string }> = {
  user: { title: 'Welcome Back', heading: 'Login as User', allowed: ['student', 'staff', 'admin'], deny: '' },
  owner: { title: 'Welcome To Radixo', heading: 'Login as Owner', allowed: ['admin'], deny: 'This number isn’t an owner account. Use “Continue as User” instead.' },
  staff: { title: 'Ready for Service', heading: 'Login as Counter Staff', allowed: ['staff', 'admin'], deny: 'This number isn’t a staff account. Ask the owner to add you as staff.' },
}

const homeFor = (role: Role) => (role === 'student' ? '/' : role === 'staff' ? '/admin/checkin' : '/admin')

// ---------- Welcome (the app's first screen) ----------

export function Welcome() {
  const { profile, loading, signOut } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-night text-white">
      <div
        className="relative flex flex-1 flex-col items-center overflow-hidden px-6 pb-10 pt-12"
        style={{ background: 'radial-gradient(120% 70% at 50% 0%, #3b2d2b 0%, #1d1716 45%, #0b0909 100%)' }}
      >
        <div className="pointer-events-none absolute left-1/2 top-24 size-72 -translate-x-1/2 rounded-full bg-brand/25 blur-3xl" aria-hidden />

        <div className="relative flex w-full max-w-sm flex-1 flex-col items-center">
          <img src="/radixo-chef.png" alt="Radixo chef" className="animate-float mt-4 w-52 drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)] sm:w-60" />
          <h1 className="animate-rise mt-3 font-script text-[64px] leading-none text-brand-grad drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">Radixo</h1>
          <p className="animate-rise mt-3 text-center text-sm font-medium tracking-wide text-white/55" style={{ animationDelay: '80ms' }}>Student meals · build your own menu</p>

          <div className="mt-auto w-full space-y-3 pt-12">
            {!loading && profile ? (
              <div className="animate-rise rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <p className="text-sm text-white/60">Logged in as</p>
                <p className="font-display text-xl font-bold">{profile.full_name}</p>
                <Link to={homeFor(profile.role)} className="bg-brand-grad shadow-brand mt-3 flex h-13 items-center justify-center gap-2 rounded-2xl font-display text-lg font-bold">
                  Continue <ArrowRight className="size-5" />
                </Link>
                <button type="button" onClick={() => signOut()} className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white/60 hover:text-white">
                  <LogOut className="size-4" /> Not you? Log out
                </button>
              </div>
            ) : (
              <>
                <Link to="/login" className="animate-rise bg-brand-grad shadow-brand flex h-12 items-center justify-center rounded-xl font-display text-[19px] font-bold transition hover:brightness-110 active:scale-[0.99]" style={{ animationDelay: '120ms' }}>
                  Continue As User
                </Link>
                <Link to="/login/owner" className="animate-rise bg-brand-grad shadow-brand flex h-12 items-center justify-center gap-2 rounded-xl font-display text-[19px] font-bold transition hover:brightness-110 active:scale-[0.99]" style={{ animationDelay: '180ms' }}>
                  <Store className="size-5 opacity-80" /> Continue As Owner
                </Link>
                <Link to="/login/staff" className="animate-rise flex h-12 items-center justify-center gap-2 rounded-xl border border-brand/60 bg-brand/10 font-display text-[19px] font-bold text-white transition hover:bg-brand/20 active:scale-[0.99]" style={{ animationDelay: '240ms' }}>
                  <ScanLine className="size-5 opacity-80" /> Continue As Counter Staff
                </Link>
                <Link to="/" className="animate-rise flex items-center justify-center gap-2 pt-2 text-sm font-semibold text-white/60 hover:text-white" style={{ animationDelay: '280ms' }}>
                  <UtensilsCrossed className="size-4" /> Just exploring? See this week&rsquo;s menu
                </Link>
              </>
            )}
          </div>

          <p className="animate-rise mt-12 text-center font-script text-[30px] leading-tight text-brand-grad" style={{ animationDelay: '300ms' }}>
            Craft your own menu<br />with ease and taste
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------- Shared shell for login / sign-up ----------

function AuthShell({ title, children, back = '/welcome' }: { title: string; children: ReactNode; back?: string }) {
  return (
    <div className="min-h-dvh bg-[#f4efe9] md:py-8">
      <div className="relative mx-auto flex min-h-[calc(100dvh-32px)] w-full max-w-md flex-col overflow-hidden bg-white md:min-h-[780px] md:rounded-[36px] md:shadow-pop">
        <Link to={back} className="absolute left-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-card hover:bg-sand" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex flex-col items-center px-6 pb-2 pt-10">
          <img src="/radixo-chef.png" alt="Radixo chef" className="animate-float w-40 drop-shadow-[0_12px_18px_rgba(120,30,20,0.18)]" />
          <h1 className="animate-rise mt-4 text-center font-script-italic text-[36px] leading-tight text-maroon">{title}</h1>
        </div>
        <div className="animate-rise relative mt-8 flex flex-1 flex-col rounded-t-[40px] border-t-[3px] border-maroon/85 bg-white px-7 pb-8 pt-9 shadow-[0_-12px_30px_-18px_rgba(139,26,18,0.35)]" style={{ animationDelay: '60ms' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Underline field with a floating label, as in the Radixo design. */
function LineField({ label, error, prefix, trailing, className, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; prefix?: string; trailing?: ReactNode }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className={className}>
      <div className={cx('relative flex items-end border-b-[2.5px] transition-colors focus-within:border-brand', error ? 'border-brand' : 'border-ink')}>
        {prefix && <span className="pb-2 pr-2 font-semibold text-ink">{prefix}</span>}
        <input
          id={fid}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : undefined}
          className="peer h-12 w-full bg-transparent pb-1 pt-4 text-[17px] font-medium text-ink outline-none focus-visible:outline-none"
          {...rest}
        />
        <label
          htmlFor={fid}
          className={cx(
            'pointer-events-none absolute top-1 text-xs font-medium text-muted transition-all',
            'peer-placeholder-shown:top-4 peer-placeholder-shown:text-[15px] peer-focus:top-1 peer-focus:text-xs peer-focus:text-brand',
            prefix ? 'left-10' : 'left-0',
          )}
        >
          {label}
        </label>
        {trailing}
      </div>
      {error && <p id={`${fid}-err`} className="mt-1.5 text-sm font-medium text-brand-600" role="alert">{error}</p>}
    </div>
  )
}

function PasswordField({ value, onChange, error, autoComplete }: { value: string; onChange: (v: string) => void; error?: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <LineField
      label="Password"
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      trailing={
        <button type="button" onClick={() => setShow(!show)} className="mb-2 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      }
    />
  )
}

function ContinueButton({ loading, children = 'Continue' }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Button type="submit" loading={loading} className="h-12 w-full rounded-xl font-display text-[19px] font-bold">
      {children}
    </Button>
  )
}

/** After a successful login, go where the user was headed, else to their role's home. */
function useAfterAuth(armed: boolean) {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  useEffect(() => {
    if (!armed || !profile) return
    const next = params.get('next')
    const canUseNext = next && (profile.role !== 'student' || !next.startsWith('/admin'))
    nav(canUseNext ? next : homeFor(profile.role), { replace: true })
  }, [armed, profile, nav, params])
}

function AlreadyIn() {
  const { profile, signOut } = useAuth()
  if (!profile) return null
  return (
    <AuthShell title={`Hi ${profile.full_name.split(' ')[0]}`}>
      <p className="font-display text-2xl font-bold">You&rsquo;re already logged in</p>
      <p className="mt-1 text-muted">{formatPhone(profile.phone)} · <span className="capitalize">{profile.role === 'admin' ? 'owner' : profile.role}</span></p>
      <div className="mt-auto space-y-3 pt-10">
        <Link to={homeFor(profile.role)} className="bg-brand-grad shadow-brand flex h-13 items-center justify-center gap-2 rounded-2xl font-display text-[21px] font-bold text-white">Continue <ArrowRight className="size-5" /></Link>
        <button type="button" onClick={() => signOut()} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line font-semibold hover:bg-sand"><LogOut className="size-4" /> Switch account</button>
      </div>
    </AuthShell>
  )
}

// ---------- Role login ----------

export function RoleLogin() {
  const { role: param } = useParams()
  const role: LoginRole = param === 'owner' || param === 'staff' ? param : 'user'
  const copy = ROLE_COPY[role]
  const { signIn, signOut, profile, loading } = useAuth()
  const [armed, setArmed] = useState(false)
  useAfterAuth(armed)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const settings = useAsync(() => loadSettings(), [])

  useEffect(() => {
    setErrors({})
    setArmed(false)
  }, [role])

  if (role === 'user') return <Navigate to="/login" replace />
  if (!armed && !busy && profile) return <AlreadyIn />
  if (!armed && !busy && loading) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!isValidPhone(phone)) errs.phone = 'Enter your 10-digit mobile number.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const u = await signIn(cleanPhone(phone), password)
      const p = await api.get('profiles', u.id)
      if (!p || !copy.allowed.includes(p.role)) {
        await signOut()
        setErrors({ form: copy.deny || 'This account can’t log in here.' })
        return
      }
      setArmed(true)
    } catch (err) {
      setErrors({ form: friendlyAuthError(err) })
    } finally {
      setBusy(false)
    }
  }

  const demoPhone = DEMO_PHONES[role]
  const wa = settings.data?.whatsapp

  return (
    <AuthShell title={copy.title}>
      <h2 className="font-display text-[28px] font-bold leading-tight">{copy.heading}</h2>
      <form onSubmit={submit} className="mt-7 flex flex-1 flex-col" noValidate>
        <div className="space-y-6">
          <LineField label="Mobile No." prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, '')); setErrors({}) }} error={errors.phone} />
          <PasswordField value={password} onChange={(v) => { setPassword(v); setErrors({}) }} error={errors.password} autoComplete="current-password" />
        </div>
        <div className="mt-3 text-right">
          <button type="button" onClick={() => setForgot(true)} className="font-condensed text-[16px] font-semibold text-brand hover:underline">Forgot password?</button>
        </div>

        {errors.form && <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-600" role="alert">{errors.form}</p>}

        {isDemo && (
          <button
            type="button"
            onClick={() => { setPhone(formatPhone(demoPhone)); setPassword(DEMO_PASSWORD); setErrors({}) }}
            className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-muted/40 bg-cream px-4 py-3 text-left text-sm hover:border-brand"
          >
            <span><span className="font-semibold">Demo {role === 'owner' ? 'owner' : 'staff'}:</span> {formatPhone(demoPhone)} · {DEMO_PASSWORD}</span>
            <span className="shrink-0 font-semibold text-brand">Fill in</span>
          </button>
        )}

        <div className="mt-auto pt-10">
          <ContinueButton loading={busy} />
          <p className="mt-6 text-center text-sm text-muted">Not {role === 'owner' ? 'the owner' : 'staff'}? <Link to="/login" className="font-semibold text-brand hover:underline">Log in as student</Link></p>
        </div>
      </form>

      <Modal open={forgot} onClose={() => setForgot(false)} title="Forgot your password?">
        <p className="text-[15px] text-muted">
          {role === 'owner'
            ? 'Reset it from your Supabase dashboard: Authentication → Users → your number → Reset password.'
            : 'Ask the manager at the Radixo counter. They can reset it for you in a minute.'}
        </p>
        {role !== 'owner' && wa && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi Radixo, please reset my password. My number is ${cleanPhone(phone) || '…'}`)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-leaf px-4 font-semibold text-white">
            <MessageCircle className="size-5" /> Message us on WhatsApp
          </a>
        )}
      </Modal>
    </AuthShell>
  )
}

// ---------- Students: mobile number + OTP ----------

export function UserLogin() {
  const { profile, loading } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  if (!loading && profile?.full_name && profile.role === 'student') return <Navigate to={next} replace />
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0d0a09] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 55% at 50% 0%, #3a2a27 0%, #171110 55%, #0d0a09 100%)' }} aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 size-80 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" aria-hidden />
      <header className="relative mx-auto flex w-full max-w-md items-center justify-between px-5 pt-5">
        <Link to="/" className="grid size-9 place-items-center rounded-full bg-white/[0.07] text-white/85 hover:bg-white/15" aria-label="Back"><ArrowLeft className="size-[18px]" /></Link>
        <Link to="/menu" className="text-sm font-semibold text-white/60 hover:text-white">Browse menus</Link>
      </header>
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
        <div className="flex flex-col items-center pt-6">
          <img src="/radixo-chef.png" alt="Radixo chef" className="animate-float w-28 drop-shadow-[0_16px_28px_rgba(0,0,0,0.6)]" />
          <h1 className="animate-rise mt-3 font-script text-[40px] leading-none text-brand-grad">Welcome back</h1>
          <p className="mt-2 text-sm text-white/50">Your menu, your QR pass, your plan.</p>
        </div>
        <div className="animate-rise relative mt-8 overflow-hidden rounded-[24px] bg-white/[0.04] p-6 ring-1 ring-white/10 backdrop-blur-sm" style={{ animationDelay: '80ms' }}>
          <span className="bg-brand-grad absolute inset-x-0 top-0 h-[3px]" aria-hidden />
          <LoginFlow dark compact hideLogo onDone={() => nav(next, { replace: true })} />
        </div>
        <p className="mt-auto pt-10 text-center text-xs text-white/40">Radixo team? <Link to="/welcome" className="font-semibold text-white/70 hover:text-white">Owner &amp; staff login</Link></p>
      </div>
    </div>
  )
}
