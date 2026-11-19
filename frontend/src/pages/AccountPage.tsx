import { useEffect, useState } from 'react';
import { Building2, LogOut } from 'lucide-react';
import { ApiError, api } from '../api/client';
import type { OrderDetail, OrderPage } from '../api/types';
import { Button, Notice, Price, Spinner } from '../components/ui';
import { useI18n } from '../i18n';
import { href, navigate } from '../router';
import { useAuth } from '../state/auth';

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const key = `order.status.${status}` as Parameters<typeof t>[0];
  return <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink">{t(key)}</span>;
}

export function AccountPage({ orderNumber }: { orderNumber?: string }) {
  const { t, money } = useI18n();
  const { user, ready, logout } = useAuth();
  const [orders, setOrders] = useState<OrderPage | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate('/');
  }, [ready, user]);

  useEffect(() => {
    if (!user) return;
    if (orderNumber) {
      setOrder(null);
      setMissing(false);
      api<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}`)
        .then(setOrder)
        .catch((e: unknown) => setMissing(e instanceof ApiError && e.status === 404));
    } else {
      api<OrderPage>('/orders').then(setOrders).catch(() => setOrders({ items: [], page: 1, page_size: 20, total_items: 0 }));
    }
  }, [user, orderNumber]);

  if (!user) return <Spinner label={t('common.loading')} />;

  const displayName = user.company_name ?? ([user.first_name, user.last_name].filter(Boolean).join(' ') || user.email);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 pb-16 sm:px-6 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit space-y-4 rounded-card border border-line bg-white p-5">
        <div>
          <p className="text-lg font-semibold text-ink">{displayName}</p>
          <p className="text-sm text-ink-soft">{user.email}</p>
        </div>
        {user.account_type === 'company' && (
          <div className="flex gap-2 rounded-lg bg-canvas p-3 text-sm">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
            <div>
              <p className="text-ink">{t('auth.tax_id')} {user.tax_id}</p>
              <p className="mt-1 text-ink-soft">{user.is_b2b ? t('account.b2b_active') : t('account.b2b_pending')}</p>
            </div>
          </div>
        )}
        <Button variant="ghost" onClick={() => void logout().then(() => navigate('/'))} className="-ml-2">
          <LogOut className="h-4 w-4" aria-hidden /> {t('account.signout')}
        </Button>
      </aside>

      <section>
        {orderNumber ? (
          <>
            <a href={href('/account')} className="text-sm text-ink-soft hover:text-ink">← {t('account.back_to_orders')}</a>
            {missing ? (
              <div className="mt-4"><Notice>{t('product.not_found')}</Notice></div>
            ) : !order ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <div className="mt-4 rounded-card border border-line bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-5">
                  <h1 className="text-xl font-bold tabular-nums text-ink">{order.order_number}</h1>
                  <StatusPill status={order.status} />
                </div>
                <ul className="divide-y divide-line">
                  {order.items.map((item) => (
                    <li key={item.product_id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block text-ink">{item.name_snapshot}</span>
                        <span className="text-xs text-ink-faint">{item.sku_snapshot} · {item.quantity} × {money(item.unit_price)}</span>
                      </span>
                      <Price value={item.line_total} className="text-sm" />
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1 border-t border-line p-5 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-soft">{t('cart.subtotal')}</dt><dd>{money(order.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-soft">{t('cart.shipping')}</dt><dd>{money(order.shipping_amount)}</dd></div>
                  <div className="flex justify-between pt-1 text-base font-semibold"><dt>{t('checkout.total')}</dt><dd>{money(order.total_amount)}</dd></div>
                  {order.payment_due_at && <p className="pt-2 text-ink-soft">{t('order.due', { date: new Date(order.payment_due_at).toLocaleDateString() })}</p>}
                </dl>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="mb-4 text-xl font-bold text-ink">{t('account.orders')}</h1>
            {!orders ? (
              <Spinner label={t('common.loading')} />
            ) : orders.items.length === 0 ? (
              <p className="rounded-card border border-line bg-white p-8 text-center text-ink-soft">{t('account.no_orders')}</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
                {orders.items.map((o) => (
                  <li key={o.order_number}>
                    <a href={href(`/account/orders/${o.order_number}`)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
                      <span>
                        <span className="block font-semibold tabular-nums text-ink">{o.order_number}</span>
                        <span className="text-xs text-ink-faint">{new Date(o.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center gap-4">
                        <StatusPill status={o.status} />
                        <Price value={o.total_amount} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
