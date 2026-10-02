// App-wide switches, set through environment variables (see .env.example).

/**
 * When false (the default while there is no WhatsApp/SMS provider), the OTP step accepts any code and can be
 * skipped, so anyone can log in to a *student* account with just the number. Owner and staff accounts always use
 * their password. Set VITE_OTP_REQUIRED=true once Supabase phone auth (Twilio WhatsApp/SMS) is configured.
 */
export const OTP_REQUIRED = import.meta.env.VITE_OTP_REQUIRED === 'true'
