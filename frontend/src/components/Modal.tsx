import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cx } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

/** First form field; else the first action that is not the close button; else anything focusable.
 * (One comma selector would pick whichever comes first in the DOM, e.g. a toggle above the field.) */
function initialFocus(panel: HTMLElement): HTMLElement | null {
  return (
    panel.querySelector<HTMLElement>(FIELDS) ??
    panel.querySelector<HTMLElement>('button:not([disabled]):not([data-close])') ??
    panel.querySelector<HTMLElement>(FOCUSABLE)
  );
}
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/**
 * Accessible dialog / side drawer.
 * - Opens focused on the first form field; Esc closes; Tab cycles inside (and pulls
 *   escaped focus back in); focus returns to the opener; body scroll locked.
 * - Motion (occasional UI, so standard animation): the drawer slides on an iOS-like
 *   curve; the dialog grows from 0.96 (never from 0) with a strong ease-out.
 *   Both exit symmetrically and become instant under prefers-reduced-motion.
 */
export function Modal({
  open, onClose, title, children, side = false, closeLabel,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: boolean; closeLabel: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Read through a ref: parents pass inline callbacks, and re-running the effect on
  // every parent render would steal focus back to the first field while typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      if (panelRef.current) initialFocus(panelRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  const panelMotion = side
    ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' }, transition: { duration: reduce ? 0 : 0.34, ease: EASE_DRAWER } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 4 },
        transition: { duration: reduce ? 0 : 0.2, ease: EASE_OUT },
      };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex" role="presentation">
          <motion.div
            className="absolute inset-0 bg-ink/40"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            {...panelMotion}
            className={cx(
              'relative flex max-h-full flex-col bg-white shadow-float',
              side ? 'ml-auto h-full w-full max-w-md' : 'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-card',
            )}
          >
            <div className="flex items-center justify-between border-b border-line py-3 pl-5 pr-3">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <button
                type="button"
                data-close
                onClick={onClose}
                className="grid h-11 w-11 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
                aria-label={closeLabel}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
