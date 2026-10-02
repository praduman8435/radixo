import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Query } from './types'
import type { TableName, Tables } from '../types'
import { OTP_REQUIRED } from '../config'
import { cleanPhone, phoneEmail } from '../phone'

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey)

  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message)
  }

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      return u ? { id: u.id, email: u.email ?? '' } : null
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        const u = session?.user
        cb(u ? { id: u.id, email: u.email ?? '' } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async signUp(email, password, profile) {
      // The handle_new_user trigger (schema.sql) copies this metadata into public.profiles.
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: profile } })
      fail(error)
      const u = data.user
      return {
        user: u ? { id: u.id, email: u.email ?? email } : null,
        needsConfirmation: !data.session,
      }
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      fail(error)
      if (!data.user) throw new Error('Could not log in.')
      return { id: data.user.id, email: data.user.email ?? email }
    },

    async sendOtp(phone) {
      if (!OTP_REQUIRED) return
      // Supabase sends the code through the provider set up in Authentication → Providers → Phone (Twilio SMS or WhatsApp).
      const { error } = await sb.auth.signInWithOtp({ phone: '+91' + cleanPhone(phone) })
      fail(error)
    },

    async phoneLogin(phone, code) {
      const p10 = cleanPhone(phone)
      let user: { id: string; email?: string | null } | null = null
      if (OTP_REQUIRED) {
        const { data, error } = await sb.auth.verifyOtp({ phone: '+91' + p10, token: code ?? '', type: 'sms' })
        fail(error)
        user = data.user
      } else {
        // Testing without an OTP provider: a fixed password per number. Only safe while you are testing;
        // switch VITE_OTP_REQUIRED on before real students use the app.
        const email = phoneEmail(p10)
        const password = `rdx-otp-off-${p10}`
        const first = await sb.auth.signInWithPassword({ email, password })
        if (first.data.user) user = first.data.user
        else {
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { phone: p10 } } })
          if (error && /already/i.test(error.message)) throw new Error('This number already has an account with a password. Ask the owner to reset it.')
          fail(error)
          if (!data.session) throw new Error('Turn off “Confirm email” in Supabase → Authentication → Providers → Email.')
          user = data.user
        }
      }
      if (!user) throw new Error('Could not log in.')
      const { data: prof } = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
      if (prof && prof.role !== 'student') {
        await sb.auth.signOut()
        throw new Error('This number belongs to the Radixo team. Use “Owner & staff login” instead.')
      }
      return { user: { id: user.id, email: user.email ?? '' }, isNew: !prof?.full_name }
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async list<K extends TableName>(table: K, q: Query<Tables[K]> = {}) {
      let query = sb.from(table).select('*')
      for (const [k, v] of Object.entries(q.eq ?? {})) query = v === null ? query.is(k, null) : query.eq(k, v)
      if (q.in) query = query.in(q.in.col, q.in.values as never)
      for (const [k, v] of Object.entries(q.gte ?? {})) query = query.gte(k, v as string | number)
      for (const [k, v] of Object.entries(q.lte ?? {})) query = query.lte(k, v as string | number)
      if (q.order) query = query.order(q.order.col, { ascending: q.order.asc ?? true })
      if (q.limit) query = query.limit(q.limit)
      const { data, error } = await query
      fail(error)
      return (data ?? []) as Tables[K][]
    },

    async get<K extends TableName>(table: K, id: string | number) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle()
      fail(error)
      return (data ?? null) as Tables[K] | null
    },

    async insert<K extends TableName>(table: K, row: Partial<Tables[K]>) {
      const { data, error } = await sb.from(table).insert(row as never).select().single()
      fail(error)
      return data as Tables[K]
    },

    async update<K extends TableName>(table: K, id: string | number, patch: Partial<Tables[K]>) {
      const { data, error } = await sb.from(table).update(patch as never).eq('id', id).select().single()
      fail(error)
      return data as Tables[K]
    },

    async upsert<K extends TableName>(table: K, row: Partial<Tables[K]>, onConflict: (keyof Tables[K] & string)[]) {
      const { data, error } = await sb.from(table).upsert(row as never, { onConflict: onConflict.join(',') }).select().single()
      fail(error)
      return data as Tables[K]
    },

    async remove<K extends TableName>(table: K, id: string | number) {
      const { error } = await sb.from(table).delete().eq('id', id)
      fail(error)
    },
  }
}
