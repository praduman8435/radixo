// Demo backend: the whole database lives in localStorage. Used when no Supabase keys are configured.
// No security here by design — it exists so the app can be tried end to end without any setup.
import type { Backend, Query } from './types'
import { createSeed, type DemoDB } from './seed'
import type { TableName, Tables } from '../types'
import { OTP_REQUIRED } from '../config'
import { runLocalRpc } from './localRpc'
import { cleanPhone, phoneEmail } from '../phone'

const KEY = 'radixo-demo-db-v5' // v5: bookings + wallet // v3: four meals, priced menus, custom menus
const listeners = new Set<(u: { id: string; email: string } | null) => void>()

function load(): DemoDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoDB
  } catch {
    /* corrupted or blocked storage — fall through to a fresh seed */
  }
  const db = createSeed()
  save(db)
  return db
}

function save(db: DemoDB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage full or blocked: the demo keeps working for this page view */
  }
}

let cache: DemoDB | null = null
const db = () => (cache ??= load())
const commit = () => save(db())

export function resetDemo() {
  cache = createSeed()
  commit()
}

const tick = () => new Promise((r) => setTimeout(r, 60)) // keeps loading states honest

function matches<T>(row: T, q: Query<T>): boolean {
  const r = row as Record<string, unknown>
  for (const [k, v] of Object.entries(q.eq ?? {})) if (r[k] !== v) return false
  if (q.in && !q.in.values.includes(r[q.in.col] as string | number)) return false
  for (const [k, v] of Object.entries(q.gte ?? {})) if ((r[k] as string | number) < (v as string | number)) return false
  for (const [k, v] of Object.entries(q.lte ?? {})) if ((r[k] as string | number) > (v as string | number)) return false
  return true
}

function currentUser() {
  const id = db().session
  const u = db().users.find((x) => x.id === id)
  return u ? { id: u.id, email: u.email } : null
}

function emit() {
  const u = currentUser()
  listeners.forEach((cb) => cb(u))
}

export function createLocalBackend(): Backend {
  return {
    mode: 'demo',

    async getUser() {
      return currentUser()
    },

    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    async signUp(email, password, profile) {
      await tick()
      const e = email.trim().toLowerCase()
      if (db().users.some((u) => u.email === e)) throw new Error('User already registered')
      const id = crypto.randomUUID()
      db().users.push({ id, email: e, password })
      db().memberSeq += 1
      db().tables.profiles.push({
        id, email: e, full_name: profile.full_name ?? '', phone: profile.phone ?? '', college: profile.college ?? '',
        year: profile.year ?? '', stay_type: profile.stay_type ?? '', area: profile.area ?? '', role: 'student',
        member_code: `RDX${String(db().memberSeq).padStart(4, '0')}`, created_at: new Date().toISOString(),
      })
      db().session = id
      commit()
      emit()
      return { user: { id, email: e }, needsConfirmation: false }
    },

    async signIn(email, password) {
      await tick()
      const u = db().users.find((x) => x.email === email.trim().toLowerCase())
      if (!u || u.password !== password) throw new Error('Invalid login credentials')
      db().session = u.id
      commit()
      emit()
      return { id: u.id, email: u.email }
    },

    async sendOtp() {
      await tick()
    },

    async phoneLogin(phone, code) {
      await tick()
      // Demo stand-in for a real OTP: 123456 when OTP is required, anything otherwise.
      if (OTP_REQUIRED && code !== '123456') throw new Error('Wrong code. In the demo, the code is 123456.')
      const p10 = cleanPhone(phone)
      const email = phoneEmail(p10)
      let u = db().users.find((x) => x.email === email)
      let isNew = false
      if (u) {
        const prof = db().tables.profiles.find((x) => x.id === u!.id)
        if (prof && prof.role !== 'student') throw new Error('This number belongs to the Radixo team. Use “Owner & staff login” instead.')
        isNew = !prof?.full_name
      } else {
        u = { id: crypto.randomUUID(), email, password: crypto.randomUUID() }
        db().users.push(u)
        db().memberSeq += 1
        db().tables.profiles.push({
          id: u.id, email, full_name: '', phone: p10, college: '', year: '', stay_type: '', area: '', role: 'student',
          member_code: `RDX${String(db().memberSeq).padStart(4, '0')}`, created_at: new Date().toISOString(),
        })
        isNew = true
      }
      db().session = u.id
      commit()
      emit()
      return { user: { id: u.id, email: u.email }, isNew }
    },

    async rpc<T>(fn: string, args: Record<string, unknown>) {
      await tick()
      const out = runLocalRpc(db(), fn, args)
      commit()
      return structuredClone(out) as T
    },

    async signOut() {
      db().session = null
      commit()
      emit()
    },

    async list<K extends TableName>(table: K, q: Query<Tables[K]> = {}) {
      await tick()
      let rows = (db().tables[table] as Tables[K][]).filter((r) => matches(r, q))
      if (q.order) {
        const { col, asc = true } = q.order
        rows = [...rows].sort((a, b) => {
          const x = (a as unknown as Record<string, unknown>)[col] as string | number
          const y = (b as unknown as Record<string, unknown>)[col] as string | number
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      if (q.limit) rows = rows.slice(0, q.limit)
      return structuredClone(rows)
    },

    async get<K extends TableName>(table: K, id: string | number) {
      await tick()
      const row = (db().tables[table] as Tables[K][]).find((r) => (r as { id: unknown }).id === id)
      return row ? structuredClone(row) : null
    },

    async insert<K extends TableName>(table: K, row: Partial<Tables[K]>) {
      await tick()
      // Mirror the database's unique UPI reference rule.
      const utr = (row as { utr?: string }).utr
      if (table === 'payments' && utr && db().tables.payments.some((p) => p.utr === utr)) throw new Error('duplicate key value violates unique constraint "payments_utr_unique"')
      const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as Tables[K]
      ;(db().tables[table] as Tables[K][]).push(full)
      commit()
      return structuredClone(full)
    },

    async update<K extends TableName>(table: K, id: string | number, patch: Partial<Tables[K]>) {
      await tick()
      const rows = db().tables[table] as Tables[K][]
      const i = rows.findIndex((r) => (r as { id: unknown }).id === id)
      if (i < 0) throw new Error('Record not found.')
      rows[i] = { ...rows[i], ...patch }
      commit()
      return structuredClone(rows[i])
    },

    async upsert<K extends TableName>(table: K, row: Partial<Tables[K]>, onConflict: (keyof Tables[K] & string)[]) {
      await tick()
      const rows = db().tables[table] as Tables[K][]
      const i = rows.findIndex((r) => onConflict.every((c) => r[c] === row[c]))
      if (i >= 0) {
        const { id: _ignored, ...rest } = row as Record<string, unknown>
        rows[i] = { ...rows[i], ...rest }
        commit()
        return structuredClone(rows[i])
      }
      const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as Tables[K]
      rows.push(full)
      commit()
      return structuredClone(full)
    },

    async remove<K extends TableName>(table: K, id: string | number) {
      await tick()
      const rows = db().tables[table] as Tables[K][]
      const i = rows.findIndex((r) => (r as { id: unknown }).id === id)
      if (i >= 0) rows.splice(i, 1)
      commit()
    },
  }
}
