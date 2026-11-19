import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import {
  BrickWall, Droplets, Hammer, HardHat, KeyRound, Loader2, Minus, Nut, Package, PaintBucket, Plug, Plus,
  Ruler, Scissors, type LucideIcon,
} from 'lucide-react';
import type { Money } from '../api/types';
import { useI18n } from '../i18n';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-black',
  secondary: 'bg-brand text-ink hover:brightness-95',
  ghost: 'bg-transparent text-ink hover:bg-black/5',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; block?: boolean }
>(function Button({ variant = 'primary', busy, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold',
        'transition-[transform,background-color,filter] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function Field({
  label, error, hint, className, ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={cx(
          'w-full rounded-lg border bg-white px-3 py-2.5 text-[15px] text-ink outline-none transition-colors',
          'placeholder:text-ink-faint focus:border-ink',
          error ? 'border-danger' : 'border-line',
        )}
        {...input}
      />
      {(error || hint) && (
        <span id={`${id}-note`} className={cx('mt-1 block text-xs', error ? 'text-danger' : 'text-ink-faint')}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

export function Notice({ tone = 'danger', children }: { tone?: 'danger' | 'info' | 'ok'; children: ReactNode }) {
  const tones = { danger: 'border-danger/30 bg-danger/5 text-danger', info: 'border-line bg-white text-ink-soft', ok: 'border-ok/30 bg-ok/5 text-ok' };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

export function Price({ value, className }: { value: Money; className?: string }) {
  const { money } = useI18n();
  return <span className={cx('font-semibold tabular-nums text-ink', className)}>{money(value)}</span>;
}

export function StockBadge({ inStock, available }: { inStock: boolean; available: number }) {
  const { t } = useI18n();
  if (!inStock) return <span className="text-xs font-medium text-ink-faint">{t('product.out_of_stock')}</span>;
  if (available <= 5) return <span className="text-xs font-medium text-brand-deep">{t('product.low_stock', { count: available })}</span>;
  return <span className="text-xs font-medium text-ok">{t('product.in_stock')}</span>;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fasteners: Nut,
  'cutting-abrasives': Scissors,
  'paint-chemicals': PaintBucket,
  'hand-tools': Hammer,
  'measuring-tools': Ruler,
  safety: HardHat,
  plumbing: Droplets,
  electrical: Plug,
  'door-hardware': KeyRound,
  construction: BrickWall,
};

/** The store's own photo, or a quiet category tile (no stock imagery). */
export function ProductImage({
  src, alt, category, className, eager,
}: { src: string | null; alt: string; category: string; className?: string; eager?: boolean }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        width={600}
        height={600}
        className={cx('h-full w-full object-contain', className)}
      />
    );
  }
  const Icon = CATEGORY_ICONS[category] ?? Package;
  return (
    <div className={cx('flex h-full w-full items-center justify-center bg-canvas', className)} role="img" aria-label={alt}>
      <Icon className="h-10 w-10 text-ink-faint/70" strokeWidth={1.25} aria-hidden />
    </div>
  );
}

export function QuantityStepper({
  value, max, onChange, busy, label,
}: { value: number; max: number; onChange: (next: number) => void; busy?: boolean; label: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white" role="group" aria-label={label}>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center text-ink hover:bg-black/5 disabled:opacity-40"
        onClick={() => onChange(value - 1)}
        disabled={busy || value <= 1}
        aria-label="−1"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center text-ink hover:bg-black/5 disabled:opacity-40"
        onClick={() => onChange(value + 1)}
        disabled={busy || value >= max}
        aria-label="+1"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}
