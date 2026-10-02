import type { Profile, TableName, Tables } from '../types'

export interface Query<T> {
  eq?: Partial<Record<keyof T & string, string | number | boolean | null>>
  in?: { col: keyof T & string; values: (string | number)[] }
  gte?: Partial<Record<keyof T & string, string | number>>
  lte?: Partial<Record<keyof T & string, string | number>>
  order?: { col: keyof T & string; asc?: boolean }
  limit?: number
}

export type RpcName = 'book' | 'mark_skip' | 'cancel_skip' | 'approve_payment' | 'reject_payment'

export interface AuthUser {
  id: string
  email: string
}

export interface SignUpResult {
  user: AuthUser | null
  /** Supabase with email confirmation on: the user must click the link before logging in. */
  needsConfirmation: boolean
}

export interface Backend {
  mode: 'demo' | 'supabase'
  getUser(): Promise<AuthUser | null>
  onAuthChange(cb: (user: AuthUser | null) => void): () => void
  signUp(email: string, password: string, profile: Partial<Profile>): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<AuthUser>
  /** Send a login code to a 10-digit Indian mobile number (no-op while OTP isn't required). */
  sendOtp(phone: string): Promise<void>
  /**
   * Log a student in by mobile number. With OTP required, `code` is verified; otherwise it is ignored.
   * Creates the account on first login. Never logs in to owner/staff accounts.
   */
  phoneLogin(phone: string, code: string | null): Promise<{ user: AuthUser; isNew: boolean }>
  signOut(): Promise<void>
  /** Call a server function (book, mark_skip, cancel_skip, approve_payment, reject_payment). */
  rpc<T = unknown>(fn: RpcName, args: Record<string, unknown>): Promise<T>

  list<K extends TableName>(table: K, q?: Query<Tables[K]>): Promise<Tables[K][]>
  get<K extends TableName>(table: K, id: string | number): Promise<Tables[K] | null>
  insert<K extends TableName>(table: K, row: Partial<Tables[K]>): Promise<Tables[K]>
  update<K extends TableName>(table: K, id: string | number, patch: Partial<Tables[K]>): Promise<Tables[K]>
  upsert<K extends TableName>(table: K, row: Partial<Tables[K]>, onConflict: (keyof Tables[K] & string)[]): Promise<Tables[K]>
  remove<K extends TableName>(table: K, id: string | number): Promise<void>
}
