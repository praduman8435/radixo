import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router'
import {
  LayoutDashboard, CalendarDays, Salad, ChefHat, Users, BadgeCheck, ScanLine, MessagesSquare, Trash2, Settings, Menu, X, LogOut, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Avatar, Logo, cx } from './ui'

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true, admin: true },
  { to: '/admin/checkin', label: 'Check-in', icon: ScanLine },
  { to: '/admin/prep', label: 'Kitchen prep', icon: ChefHat },
  { to: '/admin/menu', label: 'Weekly menu', icon: CalendarDays, admin: true },
  { to: '/admin/dishes', label: 'Dishes', icon: Salad, admin: true },
  { to: '/admin/members', label: 'Members', icon: Users, admin: true },
  { to: '/admin/approvals', label: 'Approvals', icon: BadgeCheck, admin: true },
  { to: '/admin/feedback', label: 'Feedback', icon: MessagesSquare, admin: true },
  { to: '/admin/wastage', label: 'Wastage', icon: Trash2 },
  { to: '/admin/settings', label: 'Settings', icon: Settings, admin: true },
]

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = NAV.filter((n) => !n.admin || profile?.role === 'admin')

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors', isActive ? 'bg-brand text-white shadow-sm' : 'text-ink/75 hover:bg-sand hover:text-ink')
          }
        >
          <Icon className="size-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (
    <div className="space-y-1 border-t border-line pt-3">
      <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-sand hover:text-ink">
        <ExternalLink className="size-4" /> Student view
      </Link>
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar name={profile?.full_name ?? ''} className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
          <p className="text-xs capitalize text-muted">{profile?.role}</p>
        </div>
        <button type="button" onClick={() => signOut()} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sand hover:text-ink" aria-label="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh">
      <div className="flex">
        <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-paper/60 p-4 lg:flex">
          <Link to="/admin" className="px-2 pt-1"><Logo /><span className="ml-1 align-middle text-xs font-bold uppercase tracking-wider text-muted">Admin</span></Link>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          {footer}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-cream/90 px-4 backdrop-blur lg:hidden">
            <Link to="/admin"><Logo /></Link>
            <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-xl hover:bg-sand" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-cream p-4 shadow-pop">
            <div className="flex items-center justify-between px-2">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl hover:bg-sand" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {footer}
          </div>
        </div>
      )}
    </div>
  )
}
