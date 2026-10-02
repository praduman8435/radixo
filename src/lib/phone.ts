// Students log in with their mobile number. Supabase password auth needs an email, so each number maps to a
// private address on a domain nobody receives mail for. No SMS provider (and no SMS cost) is needed.
const DOMAIN = 'phone.radixo.app'

export const cleanPhone = (s: string) => s.replace(/\D/g, '').slice(-10)
export const isValidPhone = (s: string) => /^[6-9]\d{9}$/.test(cleanPhone(s))
export const phoneEmail = (phone: string) => `${cleanPhone(phone)}@${DOMAIN}`
export const isPhoneEmail = (email: string) => email.endsWith('@' + DOMAIN)

/** "98110 00001" style, easier to read back at the counter. */
export const formatPhone = (s: string) => {
  const p = cleanPhone(s)
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : s
}

/** Turn backend auth errors into words a student understands. */
export function friendlyAuthError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login|wrong email or password/i.test(m)) return 'Wrong mobile number or password.'
  if (/already (registered|exists)/i.test(m)) return 'This mobile number already has an account. Log in instead.'
  if (/password/i.test(m) && /least|short|weak/i.test(m)) return 'Choose a longer password (at least 8 characters).'
  if (/network|fetch/i.test(m)) return 'No internet connection. Check your network and try again.'
  return m || 'Something went wrong. Please try again.'
}
