import { useState, type FormEvent } from 'react'
import { MessageSquareReply, Star } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { MEAL_OPTIONS } from '../../lib/logic'
import { addDays, currentMeal, formatDate, today } from '../../lib/dates'
import type { Feedback, Meal } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageLoader, Segmented, Textarea, cx } from '../../components/ui'
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

  return (
    <div className="animate-rise">
      <PageHeader title="Feedback" subtitle="Every rating is read by the kitchen. Complaints get a reply within 24 hours." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-5">
            <Segmented value={kind} onChange={(k) => { setKind(k); setError('') }} options={[{ value: 'rating', label: 'Rate a meal' }, { value: 'complaint', label: 'Complaint' }, { value: 'suggestion', label: 'Suggestion' }]} />
            <div className="flex flex-wrap gap-2">
              <Segmented size="sm" value={date} onChange={setDate} options={[{ value: today(), label: 'Today' }, { value: addDays(today(), -1), label: 'Yesterday' }]} />
              <Segmented size="sm" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
            </div>

            {kind === 'rating' && (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold">How was it?</p>
                  <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => { setRating(n); setError('') }} className="rounded-lg p-1 transition-transform active:scale-90">
                        <Star className={cx('size-9', n <= rating ? 'fill-turmeric text-turmeric' : 'text-line')} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(rating >= 4 ? TAGS_GOOD : rating > 0 ? TAGS_BAD : [...TAGS_GOOD.slice(0, 2), ...TAGS_BAD.slice(0, 2)]).map((t) => {
                    const on = tags.includes(t)
                    return (
                      <button key={t} type="button" aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line bg-paper hover:border-muted/50')}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <Textarea
              label={kind === 'rating' ? 'Anything else? (optional)' : kind === 'complaint' ? 'What went wrong?' : 'Your idea'}
              value={comment}
              onChange={(e) => { setComment(e.target.value); setError('') }}
              placeholder={kind === 'suggestion' ? 'e.g. Add egg curry on Fridays' : ''}
              error={error}
            />
            <Button type="submit" loading={busy} className="w-full">Send</Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Your feedback</h2>
          {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : list.data!.length === 0 ? (
            <Card><EmptyState icon={<Star className="size-6" />} title="Nothing yet">Your ratings and the kitchen&rsquo;s replies will show here.</EmptyState></Card>
          ) : (
            <ul className="space-y-3">
              {list.data!.map((f) => (
                <li key={f.id}>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={f.kind === 'complaint' ? 'red' : f.kind === 'suggestion' ? 'blue' : 'neutral'}>{KIND_LABEL[f.kind]}</Badge>
                        <span className="text-sm text-muted">{formatDate(f.date, { weekday: true })} · <span className="capitalize">{f.meal}</span></span>
                      </div>
                      {f.rating && <span className="flex items-center gap-0.5 text-sm font-bold"><Star className="size-4 fill-turmeric text-turmeric" />{f.rating}</span>}
                    </div>
                    {f.comment && <p className="mt-2 text-[15px]">{f.comment}</p>}
                    {f.admin_reply && (
                      <div className="mt-3 flex gap-2 rounded-xl bg-leaf-50 p-3 text-sm text-leaf">
                        <MessageSquareReply className="mt-0.5 size-4 shrink-0" />
                        <p><span className="font-semibold">Radixo:</span> {f.admin_reply}</p>
                      </div>
                    )}
                    {f.kind !== 'rating' && !f.admin_reply && <p className="mt-2 text-xs font-semibold text-amber">Waiting for a reply</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
