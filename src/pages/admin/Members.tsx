import { useMemo, useState } from 'react'
import { Search, MessageCircle, Download } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps, whatsappLink, type Ops } from '../../lib/admin'
import { addDays, formatDate, formatDateTime, mondayOf, today } from '../../lib/dates'
import { formatINR, mealsLabel, memberState, subLabel, type MemberState } from '../../lib/logic'
import type { Profile, Role } from '../../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Segmented, Select } from '../../components/ui'
import { WalletModal } from './Approvals'
import { useToast } from '../../components/toast'
import { useAuth } from '../../lib/auth'

type Filter = 'all' | 'active' | 'ending' | 'pending' | 'inactive' | 'team'

function stateBadge(s: MemberState) {
  switch (s.kind) {
    case 'active': return s.paused ? <Badge tone="blue">Away today</Badge> : s.daysLeft <= 5 ? <Badge tone="amber">Ends in {s.daysLeft}d</Badge> : <Badge tone="green">Active</Badge>
    case 'pending': return <Badge tone="amber">Payment pending</Badge>
    case 'upcoming': return <Badge tone="blue">Starts {formatDate(s.sub.start_date)}</Badge>
    case 'expired': return <Badge tone="red">Expired</Badge>
    default: return <Badge>No booking</Badge>
  }
}

export default function Members() {
  const q = useAsync(() => loadOps(), [])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!q.data) return []
    const ops = q.data
    const curWeek = ops.weeks.find((w) => w.week_start === mondayOf(today()))
    const nextWeek = ops.weeks.find((w) => w.week_start === addDays(mondayOf(today()), 7))
    return ops.profiles.map((p) => {
      const s = memberState(p.id, ops.subs, ops.payments, ops.pauses)
      const pick = (wid?: string) => ops.selections.find((x) => x.user_id === p.id && x.week_id === wid)
      return { p, s, cur: pick(curWeek?.id), next: pick(nextWeek?.id) }
    })
  }, [q.data])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const ops = q.data!

  const s = search.trim().toLowerCase()
  const shown = rows.filter(({ p, s: st }) => {
    if (s && !(p.full_name.toLowerCase().includes(s) || p.member_code.toLowerCase().includes(s) || p.phone.includes(s) || p.area.toLowerCase().includes(s))) return false
    if (filter === 'team') return p.role !== 'student'
    if (p.role !== 'student') return false
    if (filter === 'active') return st.kind === 'active'
    if (filter === 'ending') return st.kind === 'active' && st.daysLeft <= 5
    if (filter === 'pending') return st.kind === 'pending'
    if (filter === 'inactive') return st.kind === 'none' || st.kind === 'expired'
    return true
  })
  const packName = (id: string | null) => ops.packs.find((x) => x.id === id)?.name ?? 'Ready-made'

  function exportCsv() {
    const lines = [['Name', 'Code', 'Phone', 'Email', 'Role', 'Stay', 'Area', 'Status', 'Booked till', 'Wallet']]
    for (const { p, s: st } of shown) lines.push([p.full_name, p.member_code, p.phone, p.email, p.role, p.stay_type, p.area, st.kind, 'sub' in st ? st.sub.end_date : '', String(ops.walletOf(p.id))])
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `radixo-members-${today()}.csv`
    a.click()
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Members" subtitle={`${rows.filter((r) => r.p.role === 'student').length} students · ${rows.filter((r) => r.s.kind === 'active').length} active`} actions={<Button variant="secondary" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, phone, area" aria-label="Search members" className="h-10 w-full rounded-xl border border-line bg-paper pl-9 pr-3 text-sm focus:border-brand focus:outline-none" />
        </div>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'ending', label: 'Ending soon' }, { value: 'pending', label: 'Pending' }, { value: 'inactive', label: 'No booking' }, { value: 'team', label: 'Team' },
        ]} />
      </div>

      <Card className="overflow-x-auto">
        {shown.length === 0 ? <EmptyState title="No members match" /> : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sand/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Stay</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Booked till</th>
                <th className="px-4 py-3 font-semibold">This week</th>
                <th className="px-4 py-3 font-semibold">Next week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map(({ p, s: st, cur, next }) => (
                <tr key={p.id} className="cursor-pointer hover:bg-cream" onClick={() => setOpenId(p.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} className="size-8 text-xs" />
                      <div>
                        <p className="font-semibold">{p.full_name} {p.role !== 'student' && <Badge tone="brand" className="ml-1 capitalize">{p.role}</Badge>}</p>
                        <p className="font-mono text-xs text-muted">{p.member_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular">{p.phone}</td>
                  <td className="px-4 py-3 text-muted">{p.stay_type}{p.area && ` · ${p.area}`}</td>
                  <td className="px-4 py-3">{stateBadge(st)}</td>
                  <td className="px-4 py-3 tabular text-muted">{'sub' in st ? formatDate(st.sub.end_date) : '—'}</td>
                  <td className="px-4 py-3 text-muted">{cur ? (cur.mode === 'pack' ? packName(cur.pack_id) : 'Custom') : 'Default'}</td>
                  <td className="px-4 py-3 text-muted">{next ? (next.mode === 'pack' ? packName(next.pack_id) : 'Custom') : <span className="text-amber">Not chosen</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {openId && <MemberModal ops={ops} profile={ops.byId.get(openId)!} onClose={() => setOpenId(null)} onChanged={q.reload} />}
    </div>
  )
}

function MemberModal({ ops, profile, onClose, onChanged }: { ops: Ops; profile: Profile; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const { profile: me } = useAuth()
  const [role, setRole] = useState<Role>(profile.role)
  const [saving, setSaving] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const st = memberState(profile.id, ops.subs, ops.payments, ops.pauses)
  const subs = ops.subs.filter((s) => s.user_id === profile.id).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  const pays = ops.payments.filter((p) => p.user_id === profile.id)
  const att = ops.attendance.filter((a) => a.user_id === profile.id && a.date >= addDays(today(), -14))

  async function saveRole() {
    setSaving(true)
    try {
      await api.update('profiles', profile.id, { role })
      toast('Role updated')
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={profile.full_name} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={profile.full_name} className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-brand">{profile.member_code}</p>
            <p className="text-sm text-muted">{profile.email} · {profile.phone}</p>
            <p className="text-sm text-muted">{[profile.year, profile.stay_type, profile.area, profile.college].filter(Boolean).join(' · ')}</p>
          </div>
          {stateBadge(st)}
          {profile.phone && (
            <a href={whatsappLink(profile.phone, `Hi ${profile.full_name.split(' ')[0]}, this is Radixo.`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-leaf px-3 text-sm font-semibold text-white">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-sand p-3"><p className="font-display text-2xl font-bold">{att.length}</p><p className="text-xs text-muted">meals, last 14 days</p></div>
          <button type="button" onClick={() => setWalletOpen(true)} className="rounded-xl bg-sand p-3 hover:bg-line/60"><p className="font-display text-2xl font-bold">{formatINR(ops.walletOf(profile.id))}</p><p className="text-xs text-muted">wallet · add money</p></button>
          <div className="rounded-xl bg-sand p-3"><p className="font-display text-2xl font-bold">{formatINR(pays.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount + p.wallet_used, 0))}</p><p className="text-xs text-muted">paid in total</p></div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Bookings</h3>
          {subs.length === 0 ? <p className="text-sm text-muted">No bookings yet.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {subs.map((s) => <li key={s.id} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{subLabel(s, ops.plans, ops.packs)} <span className="text-xs text-muted">· {mealsLabel(s.meals)}</span></span><span className="text-muted tabular">{formatDate(s.start_date)} – {formatDate(s.end_date)}</span></li>)}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Payments</h3>
          {pays.length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {pays.map((p) => <li key={p.id} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{formatDateTime(p.created_at)} · {p.method === 'wallet' ? 'Wallet' : p.method === 'cash' ? 'Cash' : `UTR ${p.utr}`}{p.wallet_used > 0 && p.method !== 'wallet' ? ` + ${formatINR(p.wallet_used)} wallet` : ''}</span><span className="tabular">{formatINR(p.amount + p.wallet_used)} <Badge tone={p.status === 'approved' ? 'green' : p.status === 'pending' ? 'amber' : 'red'} className="capitalize">{p.status}</Badge></span></li>)}
            </ul>
          )}
        </div>

        {(() => {
          const txns = ops.wallet_txns.filter((x) => x.user_id === profile.id)
          return txns.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Wallet</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {txns.slice(0, 8).map((x) => <li key={x.id} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{formatDateTime(x.created_at)} · {x.note}</span><span className={x.amount >= 0 ? 'font-semibold text-leaf tabular' : 'tabular'}>{x.amount >= 0 ? '+' : '−'}{formatINR(Math.abs(x.amount))}</span></li>)}
              </ul>
            </div>
          )
        })()}

        {me?.id !== profile.id && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line p-3">
            <div className="w-48">
              <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="student">Student</option>
                <option value="staff">Staff (check-in, prep, wastage)</option>
                <option value="admin">Admin (everything)</option>
              </Select>
            </div>
            <Button variant="secondary" onClick={saveRole} loading={saving} disabled={role === profile.role}>Save role</Button>
          </div>
        )}
      </div>
      {walletOpen && <WalletModal open onClose={() => setWalletOpen(false)} ops={ops} userId={profile.id} onDone={() => { setWalletOpen(false); onChanged() }} />}
    </Modal>
  )
}
