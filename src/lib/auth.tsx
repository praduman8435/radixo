import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type AuthUser } from './backend'
import { phoneEmail } from './phone'
import type { Profile } from './types'

interface AuthCtx {
  user: AuthUser | null
  profile: Profile | null
  loading: boolean
  /** `login` is a mobile number (or an email, for older accounts). */
  signIn(login: string, password: string): Promise<AuthUser>
  signUp(phone: string, password: string, profile: Partial<Profile>): Promise<{ needsConfirmation: boolean }>
  sendOtp(phone: string): Promise<void>
  phoneLogin(phone: string, code: string | null): Promise<{ isNew: boolean }>
  signOut(): Promise<void>
  refreshProfile(): Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

async function fetchProfile(id: string): Promise<Profile | null> {
  // The Supabase trigger creates the profile right after sign-up; give it one retry.
  const p = await api.get('profiles', id)
  if (p || api.mode === 'demo') return p
  await new Promise((r) => setTimeout(r, 600))
  return api.get('profiles', id)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (u: AuthUser | null) => {
    setUser(u)
    setProfile(u ? await fetchProfile(u.id).catch(() => null) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    api.getUser().then(load)
    return api.onAuthChange((u) => {
      setLoading(true)
      void load(u)
    })
  }, [load])

  const value: AuthCtx = {
    user,
    profile,
    loading,
    async signIn(login, password) {
      return api.signIn(login.includes('@') ? login : phoneEmail(login), password)
    },
    async signUp(phone, password, p) {
      const r = await api.signUp(phoneEmail(phone), password, p)
      return { needsConfirmation: r.needsConfirmation }
    },
    async sendOtp(phone) {
      await api.sendOtp(phone)
    },
    async phoneLogin(phone, code) {
      const r = await api.phoneLogin(phone, code)
      return { isNew: r.isNew }
    },
    async signOut() {
      await api.signOut()
    },
    async refreshProfile() {
      if (user) setProfile(await fetchProfile(user.id))
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
