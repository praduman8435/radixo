import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { ChevronDown, Loader2, X } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-grad text-white shadow-brand hover:brightness-110 active:brightness-95',
  secondary: 'bg-paper text-ink border border-line hover:bg-sand',
  ghost: 'text-ink hover:bg-sand',
  danger: 'bg-paper text-brand border border-brand-100 hover:bg-brand-50',
  success: 'bg-leaf text-white hover:brightness-110 shadow-sm',
}
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2 rounded-2xl',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none',
    VARIANTS[variant], SIZES[size], extra,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}
export function Button({ variant, size, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function LinkButton({ variant, size, className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('bg-paper rounded-2xl border border-line/70 shadow-card', className)}>{children}</As>
}

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue'
const TONES: Record<Tone, string> = {
  neutral: 'bg-sand text-muted',
  brand: 'bg-brand-50 text-brand',
  green: 'bg-leaf-50 text-leaf',
  amber: 'bg-amber-50 text-amber',
  red: 'bg-brand-50 text-brand-600',
  blue: 'bg-sky-50 text-sky',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {error ? <p className="text-sm text-brand-600" role="alert">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

const inputBase = 'w-full rounded-xl border border-line bg-paper px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 transition-shadow'

export function Input({ label, hint, error, className, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  const auto = useId()
  const el = <input id={id ?? auto} className={cx(inputBase, 'h-11', error && 'border-brand', className)} aria-invalid={!!error} {...rest} />
  return label ? <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>{el}</Field> : el
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string }) {
  const auto = useId()
  const el = <textarea id={id ?? auto} className={cx(inputBase, 'py-2.5 min-h-24', className)} {...rest} />
  return label ? <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>{el}</Field> : el
}

export function Select({ label, hint, error, className, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const auto = useId()
  const el = (
    <div className="relative">
      <select id={id ?? auto} className={cx(inputBase, 'h-11 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  )
  return label ? <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>{el}</Field> : el
}

/** Pill-style single choice, used for meal, plan and filter toggles. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', full }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md'; full?: boolean }) {
  return (
    <div role="radiogroup" className={cx('no-scrollbar max-w-full gap-1 overflow-x-auto rounded-xl bg-sand p-1', full ? 'grid' : 'inline-flex', className)} style={full ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 whitespace-nowrap rounded-lg font-semibold transition-colors',
            size === 'sm' ? 'px-2.5 h-8 text-sm' : 'px-3.5 h-9 text-sm',
            value === o.value ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-brand', className ?? 'size-6')} aria-label="Loading" />
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-600" role="alert">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1">{message}</p>
      {onRetry && <Button size="sm" variant="danger" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-sand text-muted">{icon}</div>}
      <p className="text-[16px] font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'neutral', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        {icon && <span className={cx('grid size-7 place-items-center rounded-lg', TONES[tone])}>{icon}</span>}
        {label}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular">{value}</p>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </Card>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  return <span className={cx('grid size-9 shrink-0 place-items-center rounded-full bg-turmeric-50 text-sm font-bold text-amber', className)}>{initials}</span>
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'mx-0 mb-0 mt-auto w-full max-w-full rounded-t-3xl bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:w-[calc(100%-24px)] sm:rounded-3xl',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
      )}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col sm:max-h-[85vh]">
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-sand" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function Logo({ className, light, size = 'md' }: { className?: string; light?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const img = { sm: 'size-8', md: 'size-10', lg: 'size-14' }[size]
  const text = { sm: 'text-[22px]', md: 'text-[28px]', lg: 'text-[40px]' }[size]
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <img src="/radixo-chef.png" alt="" className={cx(img, 'shrink-0 object-contain drop-shadow-sm')} />
      <span className={cx('font-script leading-none', text, light ? 'text-white' : 'text-brand-grad')}>Radixo</span>
    </span>
  )
}
