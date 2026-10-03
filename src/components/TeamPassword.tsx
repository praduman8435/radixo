import { useState } from 'react'
import { setTeamPassword } from '../lib/data'
import { formatPhone } from '../lib/phone'
import { Button, Input } from './ui'
import { useToast } from './toast'

/** Owner sets a login password for a staff/owner account. They then log in at Team login with number + password. */
export function TeamPassword({ userId, phone, self }: { userId: string; phone: string; self?: boolean }) {
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (pw.length < 8) return setErr('Use at least 8 characters.')
    setBusy(true)
    try {
      await setTeamPassword(userId, pw)
      setPw('')
      setErr('')
      toast(self ? 'Password changed' : `Password set. They log in at Team login with ${formatPhone(phone)}.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <Input label={self ? 'New password' : 'Login password'} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} placeholder="At least 8 characters" error={err} />
      </div>
      <Button variant="secondary" onClick={save} loading={busy} disabled={!pw}>{self ? 'Change' : 'Set password'}</Button>
    </div>
  )
}
