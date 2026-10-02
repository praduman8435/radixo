import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router'
import { ArrowRight, LogOut, Menu as MenuIcon, MessageCircle, QrCode, Shield, Wand2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { loadSettings } from '../lib/data'
import { Avatar, cx } from './ui'
import { useLoginGate } from './LoginSheet'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menus', end: true },
  { to: '/menu/create', label: 'Build your own', end: false },
  { to: '/wallet', label: 'Plans', end: false },
]

/** Page titles for inner pages; `back` adds a close button on phones. Immersive pages hide the footer. */
function pageMeta(path: string): { title?: string; back?: string; immersive?: boolean } {
  if (path.startsWith('/menu/view')) return { title: 'Take a look at the menu', back: '/menu', immersive: true }
  if (path.startsWith('/menu/create')) return { title: 'Build your own menu', back: '/menu', immersive: true }
  return {}
}

function Brand({ light }: { light?: boolean }) {
  return (
    <Link to="/" aria-label="Radixo home" className="flex shrink-0 items-center gap-2">
      <img src="/radixo-chef-180.png" alt="" className="size-10 drop-shadow-sm sm:size-11" />
      <span className={cx('font-script text-[28px] leading-none', light ? 'text-white' : 'text-brand-grad')}>Radixo</span>
    </Link>
  )
}

export function StudentLayout() {
  const { profile, user, signOut } = useAuth()
  const { requireLogin } = useLoginGate()
  const { pathname } = useLocation()
  const meta = pageMeta(pathname)
  const isHome = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const settings = useAsync(() => loadSettings(), [])

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    setDrawer(false)
    window.scrollTo({ top: 0 })
  }, [pathname])
  useEffect(() => {
    if (!drawer) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [drawer])

  // Over the dark home hero the header is see-through; everywhere else (and once scrolled) it's solid white.
  const dark = isHome && !scrolled
  const navCls = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-full px-4 py-2 text-[15px] font-semibold transition-colors', dark ? (isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white') : isActive ? 'bg-brand-50 text-brand' : 'text-ink/70 hover:text-ink')

  const account = user ? (
    <Link to="/profile" className={cx('flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm font-semibold transition-colors sm:pr-3', dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-sand text-ink hover:bg-line/60')} aria-label="My pass and plan">
      <Avatar name={profile?.full_name || 'R'} className="size-8 text-xs" />
      <span className="hidden sm:inline">My pass</span>
    </Link>
  ) : (
    <button type="button" onClick={() => requireLogin()} className={cx('h-10 rounded-full px-4 text-sm font-bold transition-colors', dark ? 'bg-white text-ink hover:bg-white/90' : 'bg-ink text-white hover:bg-ink/85')}>
      Log in
    </button>
  )

  return (
    <div className="min-h-dvh overflow-x-clip bg-white">
      <header className={cx('no-print sticky top-0 z-40 transition-[background,box-shadow] duration-300', dark ? 'border-b border-white/[0.06] bg-[#120d0c]' : 'border-b border-line/70 bg-white/90 shadow-[0_8px_30px_-20px_rgba(31,26,23,0.35)] backdrop-blur-md')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-[72px] sm:px-6">
          {meta.back && (
            <Link to={meta.back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink/80 text-ink hover:bg-sand md:hidden"><X className="size-5" strokeWidth={2.6} /></Link>
          )}
          {meta.back && <h1 className="min-w-0 flex-1 truncate font-banner text-[20px] text-maroon md:hidden">{meta.title}</h1>}
          <div className={meta.back ? 'hidden md:block' : ''}><Brand light={dark} /></div>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={navCls}>{n.label}</NavLink>)}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {profile && profile.role !== 'student' && (
              <Link to="/admin" className={cx('hidden items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold lg:flex', dark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink')}><Shield className="size-4" /> Admin</Link>
            )}
            <Link to="/menu/create" className="bg-brand-grad shadow-brand hidden h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition hover:brightness-110 lg:inline-flex">
              <Wand2 className="size-4" /> Build my menu
            </Link>
            {!meta.back && account}
            <button type="button" onClick={() => setDrawer(true)} className={cx('grid size-10 place-items-center rounded-full md:hidden', dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-sand')} aria-label="Open menu">
              <MenuIcon className="size-6" />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <aside className="drawer-in absolute inset-y-0 right-0 flex w-[84%] max-w-sm flex-col bg-[#120d0c] text-white shadow-pop">
            <div className="flex items-center justify-between px-5 pt-5">
              <Brand light />
              <button type="button" onClick={() => setDrawer(false)} className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Close menu"><X className="size-6" /></button>
            </div>
            {user && profile && (
              <Link to="/profile" className="mx-5 mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
                <Avatar name={profile.full_name || 'R'} className="size-11" />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{profile.full_name || 'Your account'}</span><span className="block text-xs text-white/55">{profile.member_code} · your QR pass</span></span>
                <QrCode className="size-5 text-white/70" />
              </Link>
            )}
            <nav className="mt-6 flex-1 overflow-y-auto px-3" aria-label="Main">
              {[...NAV, ...(user ? [{ to: '/feedback', label: 'Rate a meal', end: false }] : [])].map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-[22px] font-bold transition-colors', isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white')}>
                  {n.label} <ArrowRight className="size-5 opacity-40" />
                </NavLink>
              ))}
            </nav>
            <div className="space-y-3 border-t border-white/10 p-5">
              <Link to="/menu/create" className="bg-brand-grad flex h-12 items-center justify-center gap-2 rounded-xl font-bold"><Wand2 className="size-4" /> Build my menu</Link>
              {user ? (
                <button type="button" onClick={() => { void signOut(); setDrawer(false) }} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white"><LogOut className="size-4" /> Log out</button>
              ) : (
                <button type="button" onClick={() => { setDrawer(false); requireLogin() }} className="flex h-12 w-full items-center justify-center rounded-xl bg-white font-bold text-ink">Log in with mobile</button>
              )}
              <Link to="/welcome" className="block text-center text-xs font-semibold text-white/45 hover:text-white/80">Owner &amp; staff login</Link>
            </div>
          </aside>
        </div>
      )}

      <main className={isHome ? '' : cx('mx-auto max-w-6xl px-4 pt-4 sm:px-6', meta.immersive ? 'pb-0' : 'pb-16')}>
        <Outlet />
      </main>

      {!meta.immersive && (
        <footer className="no-print bg-night text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <Brand light />
            <div className="flex items-center gap-5 text-xs text-white/45">
              {settings.data?.whatsapp && (
                <a href={`https://wa.me/${settings.data.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-white/70 hover:text-white">
                  <MessageCircle className="size-4" /> Chat with us
                </a>
              )}
              <span>© {new Date().getFullYear()} Radixo</span>
              <Link to="/welcome" className="hover:text-white/80">Team login</Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
