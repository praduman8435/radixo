import { createLocalBackend } from './local'
import { createSupabaseBackend } from './supabase'
import type { Backend } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Supabase when both keys are set, otherwise the in-browser demo store. */
export const api: Backend = url && key ? createSupabaseBackend(url, key) : createLocalBackend()
export const isDemo = api.mode === 'demo'
export type { Backend, Query, AuthUser } from './types'
