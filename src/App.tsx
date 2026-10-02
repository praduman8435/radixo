import { Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import type { Role } from './lib/types'
import { PageLoader } from './components/ui'
import { LoginFlow } from './components/LoginSheet'
import { StudentLayout } from './components/StudentLayout'
import { AdminLayout } from './components/AdminLayout'
import { RoleLogin, UserLogin, Welcome } from './pages/public/Auth'
import Home from './pages/app/Home'
import MenuHome from './pages/app/menu/MenuHome'
import MenuView from './pages/app/menu/MenuView'
import MenuCreate from './pages/app/menu/MenuCreate'
import Plans from './pages/app/Plans'
import FeedbackPage from './pages/app/Feedback'
import Profile from './pages/app/Profile'
import AdminOverview from './pages/admin/Overview'
import AdminMenu from './pages/admin/MenuEditor'
import AdminDishes from './pages/admin/Dishes'
import AdminPrep from './pages/admin/Prep'
import AdminMembers from './pages/admin/Members'
import AdminApprovals from './pages/admin/Approvals'
import AdminCheckIn from './pages/admin/CheckIn'
import AdminFeedback from './pages/admin/Feedback'
import AdminWastage from './pages/admin/Wastage'
import AdminSettings from './pages/admin/Settings'

/** Admin/staff pages: password login, role-checked. */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (!user) {
    const page = loc.pathname.startsWith('/admin/checkin') || loc.pathname.startsWith('/admin/prep') ? 'staff' : 'owner'
    return <Navigate to={`/login/${page}?next=${encodeURIComponent(loc.pathname)}`} replace />
  }
  if (!profile) return <PageLoader />
  if (roles && !roles.includes(profile.role)) return <Navigate to={profile.role === 'student' ? '/' : '/admin'} replace />
  return <>{children}</>
}

/** Student pages that need an account: show the phone login right there instead of redirecting. */
function NeedsLogin({ children, reason }: { children: ReactNode; reason: string }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user || !profile?.full_name) return <div className="py-10"><LoginFlow reason={reason} /></div>
  return <>{children}</>
}

/** Old /app/... links keep working. */
function LegacyApp() {
  const { pathname, search } = useLocation()
  const rest = pathname.replace(/^\/app/, '')
  const map: Record<string, string> = { '': '/', '/': '/', '/plans': '/wallet', '/account': '/profile', '/pass': '/profile' }
  return <Navigate to={(map[rest] ?? rest) + search} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<StudentLayout />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<MenuHome />} />
        <Route path="menu/view/:id" element={<MenuView />} />
        <Route path="menu/create" element={<MenuCreate />} />
        <Route path="wallet" element={<Plans />} />
        <Route path="profile" element={<NeedsLogin reason="Log in to see your QR pass and plan."><Profile /></NeedsLogin>} />
        <Route path="feedback" element={<NeedsLogin reason="Log in to rate a meal."><FeedbackPage /></NeedsLogin>} />
      </Route>

      <Route path="/login" element={<UserLogin />} />
      <Route path="/login/user" element={<Navigate to="/login" replace />} />
      <Route path="/login/:role" element={<RoleLogin />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/app/*" element={<LegacyApp />} />

      <Route path="/admin" element={<RequireAuth roles={['admin', 'staff']}><AdminLayout /></RequireAuth>}>
        <Route index element={<RoleHome />} />
        <Route path="checkin" element={<AdminCheckIn />} />
        <Route path="prep" element={<AdminPrep />} />
        <Route path="menu" element={<AdminOnly><AdminMenu /></AdminOnly>} />
        <Route path="dishes" element={<AdminOnly><AdminDishes /></AdminOnly>} />
        <Route path="members" element={<AdminOnly><AdminMembers /></AdminOnly>} />
        <Route path="approvals" element={<AdminOnly><AdminApprovals /></AdminOnly>} />
        <Route path="feedback" element={<AdminOnly><AdminFeedback /></AdminOnly>} />
        <Route path="wastage" element={<AdminWastage />} />
        <Route path="settings" element={<AdminOnly><AdminSettings /></AdminOnly>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Staff land on check-in; admins on the overview. */
function RoleHome() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <AdminOverview /> : <Navigate to="/admin/checkin" replace />
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <>{children}</> : <Navigate to="/admin/checkin" replace />
}
