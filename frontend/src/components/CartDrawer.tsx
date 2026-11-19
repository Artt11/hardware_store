import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { errorMessage } from '../api/client';
import { toAmount } from '../api/types';
import { useI18n } from '../i18n';
import { navigate } from '../router';
import { useCart } from '../state/cart';
import { Modal } from './Modal';
import { Button, Notice, Price, ProductImage, QuantityStepper } from './ui';

export function CartDrawer() {
  const { t, money, unit, name } = useI18n();
  const { cart, isOpen, close, setQuantity, remove } = useCart();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (productId: string, action: () => Promise<void>) => {
    setBusyId(productId);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e, t('common.network')));
    } finally {
      setBusyId(null);
    }
  };

  const items = cart?.items ?? [];
  const remaining = toAmount(cart?.amount_to_free_shipping);
  const threshold = toAmount(cart?.free_shipping_threshold) || 1;
  const progress = Math.min(100, Math.round(((threshold - remaining) / threshold) * 100));

  return (
    <Modal open={isOpen} onClose={close} title={t('cart.title')} side closeLabel={t('cart.close')}>
      {items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-ink-soft">{t('cart.empty')}</p>
          <Button variant="secondary" onClick={close}>{t('cart.continue')}</Button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex-1 divide-y divide-line overflow-y-auto">
            {items.map((item) => (
              <li key={item.product_id} className="flex gap-3 px-5 py-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line">
                  <ProductImage src={item.image_url} alt="" category="" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-ink">{name(item)}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {money(item.unit_price)} / {unit(item.unit_of_measure)}
                  </p>
                  {!item.is_available && (
                    <p className="mt-1 text-xs font-medium text-danger">{t('cart.unavailable', { count: item.available_quantity })}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <QuantityStepper
                      label={t('product.quantity')}
                      value={item.quantity}
                      max={Math.max(item.available_quantity, 1)}
                      busy={busyId === item.product_id}
                      onChange={(q) => run(item.product_id, () => setQuantity(item.product_id, q))}
                    />
                    <button
                      type="button"
                      onClick={() => run(item.product_id, () => remove(item.product_id))}
                      className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-black/5 hover:text-danger"
                      aria-label={`${t('cart.remove')}: ${name(item)}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <Price value={item.line_total} className="text-sm" />
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t border-line px-5 py-4">
            {error && <Notice>{error}</Notice>}
            <div>
              <p className="text-xs text-ink-soft">
                {remaining > 0 ? t('cart.free_shipping_left', { amount: money(remaining) }) : t('cart.free_shipping_reached')}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-soft">{t('cart.subtotal')}</span>
              <Price value={cart?.subtotal ?? '0'} className="text-lg" />
            </div>
            <Button block onClick={() => { close(); navigate('/checkout'); }} disabled={items.some((i) => !i.is_available)}>
              {t('cart.checkout')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
