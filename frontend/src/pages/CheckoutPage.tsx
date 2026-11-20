import { useState, type FormEvent } from 'react';
import { CheckCircle2, Receipt, ShoppingCart, Store, Truck } from 'lucide-react';
import { ApiError, api, errorMessage } from '../api/client';
import {
  toAmount, type CheckoutPayload, type DeliveryMethod, type OrderDetail, type PaymentMethod, type StockShortage,
} from '../api/types';
import { Button, Field, Notice, Price, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';

const FREE_SHIPPING = 50000;
const EXPRESS_COST = 2500;

export function CheckoutPage() {
  const { t, money, city, name } = useI18n();
  const { user } = useAuth();
  const { cart, reload } = useCart();
  const [delivery, setDelivery] = useState<DeliveryMethod>('express');
  const [payment, setPayment] = useState<PaymentMethod>(user?.is_b2b ? 'b2b_invoice' : 'cash_on_delivery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  const [placed, setPlaced] = useState<OrderDetail | null>(null);

  if (placed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-ink">{t('checkout.success_title')}</h1>
        <p className="mt-2 text-lg font-semibold tabular-nums text-ink">{t('checkout.success_number', { number: placed.order_number })}</p>
        <p className="mt-1 text-ink-soft">{t('checkout.success_hint')}</p>
        {placed.payment_due_at && (
          <p className="mt-1 text-sm text-ink-soft">{t('order.due', { date: new Date(placed.payment_due_at).toLocaleDateString() })}</p>
        )}
        <a href={href(user ? `/account/orders/${placed.order_number}` : '/')} className="mt-6 inline-block text-sm font-semibold text-brand-deep hover:underline">
          {user ? t('account.orders') : t('cart.continue')} →
        </a>
      </div>
    );
  }

  const items = cart?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <ShoppingCart className="h-10 w-10 text-ink-faint" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-5 text-xl font-semibold text-ink">{t('cart.empty')}</h1>
        <p className="mt-2 max-w-[40ch] text-sm leading-6 text-ink-soft">{t('checkout.empty_hint')}</p>
        <a
          href={href('/')}
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-150 ease-out hover:bg-black active:scale-[0.97]"
        >
          {t('cart.continue')}
        </a>
      </div>
    );
  }

  const subtotal = toAmount(cart?.subtotal);
  const shipping = delivery === 'pickup' || subtotal >= FREE_SHIPPING ? 0 : EXPRESS_COST;
  const customerName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.contact_person || '' : '';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const payload: CheckoutPayload = {
      delivery_method: delivery,
      payment_method: payment,
      customer: { name: form.name, phone: form.phone, email: user ? undefined : form.email },
      shipping_address: delivery === 'express' ? { city: form.city, address: form.address } : undefined,
      notes: form.notes || undefined,
    };
    setBusy(true);
    setError(null);
    setShortages([]);
    try {
      const order = await api<OrderDetail>('/checkout', { method: 'POST', body: payload });
      setPlaced(order);
      await reload();
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { shortages?: StockShortage[] }) : null;
      if (detail?.shortages) {
        setShortages(detail.shortages);
        await reload().catch(() => undefined);
      } else {
        setError(errorMessage(e, t('checkout.error')));
      }
    } finally {
      setBusy(false);
    }
  };

  const option = (active: boolean) =>
    cx('flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-4 transition-colors', active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink-faint');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">{t('checkout.title')}</h1>
      <form onSubmit={submit} className="mt-6 grid gap-8 pb-16 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-semibold text-ink">{t('checkout.contact')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('checkout.name')} name="name" required minLength={2} maxLength={200} defaultValue={customerName} autoComplete="name" />
              <Field label={t('checkout.phone')} name="phone" type="tel" required maxLength={20} defaultValue={user?.phone ?? ''} autoComplete="tel" />
              {!user && <Field label={t('checkout.email')} name="email" type="email" required autoComplete="email" className="sm:col-span-2" />}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-ink">{t('checkout.delivery')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={option(delivery === 'express')}>
                <input type="radio" name="delivery" className="sr-only" checked={delivery === 'express'} onChange={() => setDelivery('express')} />
                <Truck className="mt-0.5 h-5 w-5 text-ink" aria-hidden />
                <span><span className="block text-sm font-semibold text-ink">{t('checkout.express')}</span><span className="block text-xs text-ink-soft">{t('checkout.express_hint')}</span></span>
              </label>
              <label className={option(delivery === 'pickup')}>
                <input type="radio" name="delivery" className="sr-only" checked={delivery === 'pickup'} onChange={() => setDelivery('pickup')} />
                <Store className="mt-0.5 h-5 w-5 text-ink" aria-hidden />
                <span><span className="block text-sm font-semibold text-ink">{t('checkout.pickup')}</span><span className="block text-xs text-ink-soft">{t('checkout.pickup_hint')}</span></span>
              </label>
            </div>
            {delivery === 'express' && (
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <Field label={t('checkout.city')} name="city" required minLength={2} maxLength={100} defaultValue={city} autoComplete="address-level2" />
                <Field label={t('checkout.address')} name="address" required minLength={3} maxLength={300} autoComplete="street-address" />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-ink">{t('checkout.payment')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['cash_on_delivery', 'card'] as const).map((method) => (
                <label key={method} className={option(payment === method)}>
                  <input type="radio" name="payment" className="sr-only" checked={payment === method} onChange={() => setPayment(method)} />
                  <span className="text-sm font-semibold text-ink">{method === 'card' ? t('checkout.card') : t('checkout.cash')}</span>
                </label>
              ))}
              {user?.is_b2b && (
                <label className={cx(option(payment === 'b2b_invoice'), 'sm:col-span-2')}>
                  <input type="radio" name="payment" className="sr-only" checked={payment === 'b2b_invoice'} onChange={() => setPayment('b2b_invoice')} />
                  <Receipt className="mt-0.5 h-5 w-5 text-ink" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t('checkout.invoice')}</span>
                    <span className="block text-xs text-ink-soft">{user.company_name} · {t('auth.tax_id')} {user.tax_id}</span>
                  </span>
                </label>
              )}
            </div>
          </section>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">{t('checkout.notes')}</span>
            <textarea name="notes" maxLength={1000} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-ink" />
          </label>
        </div>

        <aside className="h-fit space-y-4 rounded-card border border-line bg-white p-5 lg:sticky lg:top-24">
          <h2 className="font-semibold text-ink">{t('checkout.summary')}</h2>
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.product_id} className="flex justify-between gap-3">
                <span className="min-w-0 text-ink-soft"><span className="line-clamp-1">{name(item)}</span><span className="text-xs text-ink-faint">× {item.quantity}</span></span>
                <Price value={item.line_total} className="text-sm" />
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">{t('cart.subtotal')}</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{t('cart.shipping')}</dt><dd className="tabular-nums">{money(shipping)}</dd></div>
            <div className="flex justify-between pt-2 text-base font-semibold"><dt>{t('checkout.total')}</dt><dd className="tabular-nums">{money(subtotal + shipping)}</dd></div>
          </dl>
          {shortages.length > 0 && (
            <Notice>
              <p>{t('checkout.shortage')}</p>
              <ul className="mt-1 list-disc pl-4">
                {shortages.map((s) => <li key={s.product_id}>{t('checkout.shortage_line', { name: s.name, requested: s.requested, available: s.available })}</li>)}
              </ul>
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          <Button type="submit" block busy={busy}>{busy ? t('checkout.placing') : t('checkout.place')}</Button>
        </aside>
      </form>
    </div>
  );
}
