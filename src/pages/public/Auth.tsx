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
import { Modal, cx } from '../../components/ui'
import { LoginFlow } from '../../components/LoginSheet'

type LoginRole = 'user' | 'owner' | 'staff'

const ROLE_COPY: Record<LoginRole, { title: string; sub: string; heading: string; hint: string; allowed: Role[]; deny: string; missing: string }> = {
  user: { title: 'Welcome back', sub: '', heading: 'Login as User', hint: '', allowed: ['student', 'staff', 'admin'], deny: '', missing: '' },
  owner: { title: 'Owner login', sub: 'Menus, payments, members and settings.', heading: 'Log in with your password', hint: 'Owners use a password, not an OTP.', allowed: ['admin'], deny: 'This number isn’t an owner account. Members log in from the member login.', missing: 'Wrong number or password. If you haven’t set up the owner account yet, see the README → “Create the owner account”.' },
  staff: { title: 'Counter staff', sub: 'Check-in, kitchen prep and wastage.', heading: 'Log in with your password', hint: 'The owner creates your account and password.', allowed: ['staff', 'admin'], deny: 'This number isn’t a staff account. Ask the owner to add you as staff.', missing: 'Wrong number or password. Ask the owner to check your account.' },
}

const homeFor = (role: Role) => (role === 'student' ? '/' : role === 'staff' ? '/admin/checkin' : '/admin')

// ---------- Welcome (the app's first screen) ----------

export function Welcome() {
  const { profile, loading, signOut } = useAuth()
  return (
    <DarkShell title="Radixo" subtitle="Dining · chef-cooked meals, built your way" back="/" link={{ to: '/menu', label: 'Browse menus' }}>
      <div className="mt-auto w-full space-y-3 pt-12">
        {!loading && profile ? (
          <DarkCard>
            <p className="text-sm text-white/55">Logged in as</p>
            <p className="mt-0.5 text-[18px] font-semibold">{profile.full_name || formatPhone(profile.phone)}</p>
            <Link to={homeFor(profile.role)} className="bg-brand-grad mt-5 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold">Continue <ArrowRight className="size-4" /></Link>
            <button type="button" onClick={() => signOut()} className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white/60 ring-1 ring-white/12 hover:text-white"><LogOut className="size-4" /> Not you? Log out</button>
          </DarkCard>
        ) : (
          <>
            <Link to="/login" className="animate-rise bg-brand-grad flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold transition hover:brightness-110 active:scale-[0.99]">
              Continue to Radixo Dining
            </Link>
            <p className="pt-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Radixo team</p>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/login/owner" className="animate-rise flex h-12 items-center justify-center gap-2 rounded-full bg-white/[0.06] text-sm font-semibold text-white/85 ring-1 ring-white/12 transition hover:bg-white/10 hover:text-white">
                <Store className="size-4 opacity-70" /> Owner
              </Link>
              <Link to="/login/staff" className="animate-rise flex h-12 items-center justify-center gap-2 rounded-full bg-white/[0.06] text-sm font-semibold text-white/85 ring-1 ring-white/12 transition hover:bg-white/10 hover:text-white">
                <ScanLine className="size-4 opacity-70" /> Counter staff
              </Link>
            </div>
            <Link to="/menu" className="flex items-center justify-center gap-2 pt-4 text-sm font-semibold text-white/55 hover:text-white">
              <UtensilsCrossed className="size-4" /> Just exploring? See this week&rsquo;s menus
            </Link>
          </>
        )}
      </div>
    </DarkShell>
  )
}

// ---------- Shared shell for login screens ----------

function DarkShell({ title, subtitle, children, back = '/welcome', link }: { title: string; subtitle?: string; children: ReactNode; back?: string; link?: { to: string; label: string } }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0d0a09] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 55% at 50% 0%, #3a2a27 0%, #171110 55%, #0d0a09 100%)' }} aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 size-80 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" aria-hidden />
      <header className="relative mx-auto flex w-full max-w-md items-center justify-between px-5 pt-5">
        <Link to={back} className="grid size-9 place-items-center rounded-full bg-white/[0.07] text-white/85 hover:bg-white/15" aria-label="Back"><ArrowLeft className="size-[18px]" /></Link>
        {link && <Link to={link.to} className="text-sm font-semibold text-white/60 hover:text-white">{link.label}</Link>}
      </header>
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
        <div className="flex flex-col items-center pt-6">
          <img src="/radixo-chef.png" alt="Radixo chef" className="animate-float w-28 drop-shadow-[0_16px_28px_rgba(0,0,0,0.6)]" />
          <h1 className="animate-rise mt-3 font-script text-[40px] leading-none text-brand-grad">{title}</h1>
          {subtitle && <p className="mt-2 text-center text-sm text-white/50">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

function DarkCard({ children }: { children: ReactNode }) {
  return (
    <div className="animate-rise relative mt-8 overflow-hidden rounded-[24px] bg-white/[0.04] p-6 ring-1 ring-white/10 backdrop-blur-sm" style={{ animationDelay: '80ms' }}>
      <span className="bg-brand-grad absolute inset-x-0 top-0 h-[3px]" aria-hidden />
      {children}
    </div>
  )
}

const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45'

function DarkField({ label, error, prefix, trailing, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; prefix?: string; trailing?: ReactNode }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div>
      <label htmlFor={fid} className={labelCls}>{label}</label>
      <div className={cx('flex h-12 items-center rounded-xl bg-white/[0.06] px-4 ring-1 transition focus-within:ring-2 focus-within:ring-brand', error ? 'ring-brand' : 'ring-white/12')}>
        {prefix && <span className="mr-2 border-r border-white/15 pr-3 text-[15px] font-semibold text-white/80">{prefix}</span>}
        <input id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-white outline-none placeholder:font-normal placeholder:text-white/30 focus-visible:outline-none" {...rest} />
        {trailing}
      </div>
      {error && <p id={`${fid}-err`} className="mt-1.5 text-sm text-[#ff8a7a]" role="alert">{error}</p>}
    </div>
  )
}

function PasswordField({ value, onChange, error, autoComplete }: { value: string; onChange: (v: string) => void; error?: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <DarkField
      label="Password"
      placeholder="Your password"
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      trailing={
        <button type="button" onClick={() => setShow(!show)} className="-mr-2 grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      }
    />
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
    <DarkShell title={`Hi ${profile.full_name.split(' ')[0] || 'there'}`} subtitle="You’re already logged in">
      <DarkCard>
        <p className="text-sm text-white/55">{formatPhone(profile.phone)} · <span className="capitalize">{profile.role === 'admin' ? 'owner' : profile.role}</span></p>
        <Link to={homeFor(profile.role)} className="bg-brand-grad mt-5 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold">Continue <ArrowRight className="size-4" /></Link>
        <button type="button" onClick={() => signOut()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white/65 ring-1 ring-white/12 hover:bg-white/[0.06] hover:text-white"><LogOut className="size-4" /> Switch account</button>
      </DarkCard>
    </DarkShell>
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
      setErrors({ form: friendlyAuthError(err) === 'Wrong mobile number or password.' ? copy.missing : friendlyAuthError(err) })
    } finally {
      setBusy(false)
    }
  }

  const demoPhone = DEMO_PHONES[role]
  const wa = settings.data?.whatsapp

  return (
    <DarkShell title={copy.title} subtitle={copy.sub} link={{ to: '/login', label: 'Member login' }}>
      <DarkCard>
        <h2 className="text-[18px] font-semibold">{copy.heading}</h2>
        <p className="mt-1 text-sm text-white/50">{copy.hint}</p>
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <DarkField label="Mobile number" placeholder="98765 43210" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, '')); setErrors({}) }} error={errors.phone} />
          <PasswordField value={password} onChange={(v) => { setPassword(v); setErrors({}) }} error={errors.password} autoComplete="current-password" />
          <div className="text-right">
            <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-white/55 hover:text-white">Forgot password?</button>
          </div>

          {errors.form && <p className="rounded-xl bg-[#ff8a7a]/10 px-4 py-3 text-sm text-[#ff9d8f] ring-1 ring-[#ff8a7a]/25" role="alert">{errors.form}</p>}

          {isDemo && (
            <button type="button" onClick={() => { setPhone(formatPhone(demoPhone)); setPassword(DEMO_PASSWORD); setErrors({}) }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-white/20 px-4 py-3 text-left text-sm text-white/70 hover:border-brand hover:text-white">
              <span><span className="font-semibold">Demo {role === 'owner' ? 'owner' : 'staff'}:</span> {formatPhone(demoPhone)} · {DEMO_PASSWORD}</span>
              <span className="shrink-0 font-semibold text-[#ff7a5c]">Fill in</span>
            </button>
          )}

          <button type="submit" disabled={busy} className="bg-brand-grad h-12 w-full rounded-full text-[15px] font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60">{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
      </DarkCard>
      <p className="mt-auto pt-10 text-center text-xs text-white/40">{role === 'owner' ? 'Staff?' : 'Owner?'} <Link to={role === 'owner' ? '/login/staff' : '/login/owner'} className="font-semibold text-white/70 hover:text-white">{role === 'owner' ? 'Counter staff login' : 'Owner login'}</Link></p>

      <Modal open={forgot} onClose={() => setForgot(false)} title="Forgot your password?">
        <p className="text-[15px] text-muted">
          {role === 'owner'
            ? 'Reset it from your Supabase dashboard: Authentication → Users → your number → Reset password.'
            : 'Ask the owner or the manager at the Radixo counter. They can reset it for you in a minute.'}
        </p>
        {role !== 'owner' && wa && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi Radixo, please reset my password. My number is ${cleanPhone(phone) || '…'}`)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-leaf px-4 font-semibold text-white">
            <MessageCircle className="size-5" /> Message us on WhatsApp
          </a>
        )}
      </Modal>
    </DarkShell>
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
    <DarkShell title="Welcome back" subtitle="Your table is ready. Your menu, your dining pass, your bookings." back="/" link={{ to: '/menu', label: 'Browse menus' }}>
      <DarkCard>
        <LoginFlow dark compact hideLogo onDone={() => nav(next, { replace: true })} />
      </DarkCard>
      <p className="mt-auto pt-10 text-center text-xs text-white/40">Radixo team? <Link to="/welcome" className="font-semibold text-white/70 hover:text-white">Owner &amp; staff login</Link></p>
    </DarkShell>
  )
}
