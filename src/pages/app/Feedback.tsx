import { useState, type FormEvent } from 'react'
import { MessageSquareReply, Star } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { MEAL_OPTIONS } from '../../lib/logic'
import { addDays, currentMeal, formatDate, today } from '../../lib/dates'
import type { Feedback, Meal } from '../../lib/types'
import { ErrorNote, PageLoader, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

const TAGS_GOOD = ['Tasty', 'Fresh', 'Good portion', 'Hot food']
const TAGS_BAD = ['Too oily', 'Too salty', 'Too spicy', 'Cold food', 'Long queue']
const KIND_LABEL: Record<Feedback['kind'], string> = { rating: 'Rating', complaint: 'Complaint', suggestion: 'Suggestion' }

export default function FeedbackPage() {
  const { profile } = useAuth()
  const uid = profile!.id
  const toast = useToast()
  const list = useAsync(() => api.list('feedback', { eq: { user_id: uid }, order: { col: 'created_at', asc: false } }), [uid])

  const [kind, setKind] = useState<Feedback['kind']>('rating')
  const [date, setDate] = useState(today())
  const [meal, setMeal] = useState<Meal>(currentMeal())
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (kind === 'rating' && rating === 0) return setError('Tap a star to rate.')
    if (kind !== 'rating' && comment.trim().length < 5) return setError('Tell us a little more.')
    setBusy(true)
    try {
      const text = [tags.join(', '), comment.trim()].filter(Boolean).join(' — ')
      await api.insert('feedback', { user_id: uid, date, meal, kind, rating: kind === 'rating' ? rating : null, comment: text, status: 'open', admin_reply: '' })
      toast(kind === 'rating' ? 'Thanks for rating!' : 'Sent. We reply within 24 hours.')
      setRating(0)
      setTags([])
      setComment('')
      setError('')
      list.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send', 'error')
    } finally {
      setBusy(false)
    }
  }

  const pill = (on: boolean) => cx('h-9 rounded-full px-3.5 text-sm font-semibold transition-colors', on ? 'bg-white text-ink' : 'bg-white/[0.06] text-white/70 ring-1 ring-white/10 hover:bg-white/10')

  return (
    <div className="mx-auto max-w-5xl animate-rise pb-6 pt-2 text-white md:pt-6">
      <h1 className="text-[26px] font-semibold tracking-tight">Feedback</h1>
      <p className="mt-1 text-sm text-white/55">Every rating is read by the kitchen. Complaints get a reply within 24 hours.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10">
          <form onSubmit={submit} className="space-y-5">
            <div className="flex gap-1 rounded-full bg-white/[0.05] p-1 ring-1 ring-white/10">
              {(['rating', 'complaint', 'suggestion'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setError('') }} className={cx('h-9 flex-1 rounded-full text-sm font-semibold transition-colors', kind === k ? 'bg-white text-ink' : 'text-white/65 hover:text-white')}>{k === 'rating' ? 'Rate a meal' : KIND_LABEL[k]}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ v: today(), l: 'Today' }, { v: addDays(today(), -1), l: 'Yesterday' }].map((d) => <button key={d.v} type="button" aria-pressed={date === d.v} onClick={() => setDate(d.v)} className={pill(date === d.v)}>{d.l}</button>)}
              <span className="mx-1 w-px self-stretch bg-white/10" aria-hidden />
              {MEAL_OPTIONS.map((m) => <button key={m.value} type="button" aria-pressed={meal === m.value} onClick={() => setMeal(m.value)} className={pill(meal === m.value)}>{m.label}</button>)}
            </div>

            {kind === 'rating' && (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold">How was it?</p>
                  <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => { setRating(n); setError('') }} className="rounded-lg p-1 transition-transform active:scale-90">
                        <Star className={cx('size-9', n <= rating ? 'fill-turmeric text-turmeric' : 'text-white/20')} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(rating >= 4 ? TAGS_GOOD : rating > 0 ? TAGS_BAD : [...TAGS_GOOD.slice(0, 2), ...TAGS_BAD.slice(0, 2)]).map((t) => {
                    const on = tags.includes(t)
                    return <button key={t} type="button" aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} className={pill(on)}>{t}</button>
                  })}
                </div>
              </>
            )}
            <div>
              <label htmlFor="fb-comment" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{kind === 'rating' ? 'Anything else? (optional)' : kind === 'complaint' ? 'What went wrong?' : 'Your idea'}</label>
              <textarea id="fb-comment" rows={4} value={comment} onChange={(e) => { setComment(e.target.value); setError('') }} placeholder={kind === 'suggestion' ? 'e.g. Add egg curry on Fridays' : ''} className="w-full rounded-xl bg-white/[0.06] px-4 py-3 text-[15px] text-white outline-none ring-1 ring-white/12 placeholder:text-white/30 focus:ring-2 focus:ring-brand" />
              {error && <p className="mt-1.5 text-sm text-[#ff8a7a]" role="alert">{error}</p>}
            </div>
            <button type="submit" disabled={busy} className="bg-brand-grad h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-[17px] font-semibold">Your feedback</h2>
          {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : list.data!.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.04] p-5 text-sm text-white/55 ring-1 ring-white/10">Nothing yet. Your ratings and the kitchen&rsquo;s replies will show here.</p>
          ) : (
            <ul className="space-y-3">
              {list.data!.map((f) => (
                <li key={f.id} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', f.kind === 'complaint' ? 'bg-[#ff8a7a]/15 text-[#ff8a7a]' : f.kind === 'suggestion' ? 'bg-sky-400/15 text-sky-300' : 'bg-white/10 text-white/70')}>{KIND_LABEL[f.kind]}</span>
                      <span className="text-sm text-white/50">{formatDate(f.date, { weekday: true })} · <span className="capitalize">{f.meal}</span></span>
                    </div>
                    {f.rating && <span className="flex items-center gap-0.5 text-sm font-bold"><Star className="size-4 fill-turmeric text-turmeric" />{f.rating}</span>}
                  </div>
                  {f.comment && <p className="mt-2 text-[15px] text-white/85">{f.comment}</p>}
                  {f.admin_reply && (
                    <div className="mt-3 flex gap-2 rounded-xl bg-[#34c759]/10 p-3 text-sm text-[#7be59a]">
                      <MessageSquareReply className="mt-0.5 size-4 shrink-0" />
                      <p><span className="font-semibold">Radixo:</span> {f.admin_reply}</p>
                    </div>
                  )}
                  {f.kind !== 'rating' && !f.admin_reply && <p className="mt-2 text-xs font-semibold text-turmeric">Waiting for a reply</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
