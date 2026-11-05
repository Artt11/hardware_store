import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  User,
  Package,
  Heart,
  ShieldCheck,
  Building2,
  LogOut,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  Truck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, Language } from '../../context/LanguageContext';
import { useWishlist } from '../../hooks/useWishlist';
import { Product } from '../../types/product';
import { formatProductPrice } from '../product/ProductCard';
import { API_BASE_URL, getEffectiveUnitPrice } from '../../config/api';

interface UserDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

interface PersistedOrderItem {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  pricing_tier: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PersistedOrder {
  order_id: string;
  order_number: string;
  order_type: string;
  status: string;
  payment_method: string;
  payment_status: string;
  currency: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  grand_total: number;
  items_count: number;
  created_at: string;
  items: PersistedOrderItem[];
}

const DASHBOARD_LABELS: Record<Language, Record<string, string>> = {
  hy: {
    b2bAccount: 'B2B Կորպորատիվ Հաշիվ',
    b2cAccount: 'Անհատական Հաշիվ',
    logout: 'Դուրս գալ',
    profileTab: 'Անձնական Տվյալներ',
    ordersTab: 'Պատվերների Պատմություն',
    wishlistTab: 'Նախընտրած Ապրանքներ',
    securityActive: 'Սեսիայի Անվտանգություն՝ Ակտիվ',
    accountId: 'Հաշվի ID',
    verifiedEmail: 'Էլ. Հասցե',
    companyName: 'Կազմակերպություն',
    taxId: 'ՀՎՀՀ (Tax ID)',
    contactPerson: 'Պատասխանատու Անձ',
    phone: 'Հեռախոսահամար',
    fullName: 'Անուն Ազգանուն',
    noOrdersTitle: 'Դուք դեռ պատվերներ չունեք',
    noOrdersSub: 'Ձեր կատարած բոլոր B2C և B2B պատվերները կպահպանվեն այստեղ։',
    emptyWishlistTitle: 'Նախընտրածների ցանկը դատարկ է',
    emptyWishlistSub: 'Սեղմեք սրտիկի նշանին ցանկացած ապրանքի վրա՝ այն պահպանելու համար։',
    addBtn: 'Գնել',
    placedOn: 'Ամսաթիվ՝',
    itemsLabel: 'ապրանք',
  },
  ru: {
    b2bAccount: 'B2B Корпоративный Аккаунт',
    b2cAccount: 'Личный Аккаунт',
    logout: 'Выйти',
    profileTab: 'Профиль',
    ordersTab: 'История Заказов',
    wishlistTab: 'Избранные Товары',
    securityActive: 'Безопасность Сессии: Активна',
    accountId: 'ID Аккаунта',
    verifiedEmail: 'Эл. Почта',
    companyName: 'Организация',
    taxId: 'ИНН / ՀՎՀՀ',
    contactPerson: 'Контактное Лицо',
    phone: 'Телефон',
    fullName: 'ФИО',
    noOrdersTitle: 'У вас пока нет оформленных заказов',
    noOrdersSub: 'Все ваши розничные и оптовые B2B заказы будут отображаться здесь.',
    emptyWishlistTitle: 'Список избранного пуст',
    emptyWishlistSub: 'Нажмите на иконку сердечка на карточке товара, чтобы сохранить его.',
    addBtn: 'В корзину',
    placedOn: 'Дата:',
    itemsLabel: 'шт.',
  },
  en: {
    b2bAccount: 'B2B Enterprise Account',
    b2cAccount: 'Individual Account',
    logout: 'Logout',
    profileTab: 'Profile Info',
    ordersTab: 'Order History',
    wishlistTab: 'Saved Items (Wishlist)',
    securityActive: 'Enterprise Session Security: Active',
    accountId: 'Account ID',
    verifiedEmail: 'Verified Email',
    companyName: 'Company Name',
    taxId: 'Tax ID (ՀՎՀՀ)',
    contactPerson: 'Authorized Contact',
    phone: 'Phone',
    fullName: 'Full Name',
    noOrdersTitle: 'No orders placed yet',
    noOrdersSub: 'All your confirmed B2C and B2B orders will appear here automatically.',
    emptyWishlistTitle: 'Your wishlist is empty',
    emptyWishlistSub: 'Click the heart icon on any hardware item to save it to your profile.',
    addBtn: 'Add',
    placedOn: 'Placed on',
    itemsLabel: 'item(s)',
  },
};

export const UserDashboard: React.FC<UserDashboardProps> = ({ isOpen, onClose, onAddToCart }) => {
  const { user, accessToken, logout } = useAuth();
  const { lang } = useLanguage();
  const L = DASHBOARD_LABELS[lang] || DASHBOARD_LABELS.hy;
  const { wishlist, removeFromWishlist } = useWishlist();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist'>('profile');
  const [orders, setOrders] = useState<PersistedOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);

  // ISSUE-02 Fix: Fetch real PostgreSQL order history from `/api/v1/cart/orders`
  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let cancelled = false;

    const loadOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const res = await fetch(`${API_BASE_URL}/cart/orders`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setOrders(Array.isArray(data) ? data : []);
        }
      } catch {
        // Ignore network errors and show empty state
      } finally {
        if (!cancelled) {
          setIsLoadingOrders(false);
        }
      }
    };

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  if (!isOpen || !user) return null;

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Dashboard Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl z-10"
        >
          {/* Dashboard Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0D5257] text-white font-black text-base shadow-sm">
                {user.account_type === 'company' ? (
                  <Building2 className="h-5 w-5" />
                ) : (
                  user.first_name?.[0] || 'U'
                )}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900">
                  {user.account_type === 'company'
                    ? user.company_name
                    : `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email}
                </h3>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-[#0D5257]">
                    {user.account_type === 'company' ? L.b2bAccount : L.b2cAccount}
                  </span>
                  <span>•</span>
                  <span>{user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:border-black hover:text-black transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{L.logout}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-100 px-6 bg-neutral-50/50">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 ${
                activeTab === 'profile'
                  ? 'border-[#0D5257] text-[#0D5257]'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <User className="h-4 w-4" />
              <span>{L.profileTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 ${
                activeTab === 'orders'
                  ? 'border-[#0D5257] text-[#0D5257]'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>{L.ordersTab}</span>
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.2 text-[10px] font-mono text-neutral-700">
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wishlist')}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 ${
                activeTab === 'wishlist'
                  ? 'border-[#0D5257] text-[#0D5257]'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Heart className="h-4 w-4" />
              <span>{L.wishlistTab}</span>
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.2 text-[10px] font-mono text-neutral-700">
                {wishlist.length}
              </span>
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* 1. Profile Info Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <motion.div
                  whileHover={{ y: -2 }}
                  className="rounded-2xl bg-neutral-50 p-5 shadow-sm border border-neutral-100 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                        {L.securityActive}
                      </span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      OWASP Fortified
                    </span>
                  </div>
                </motion.div>

                <div className="rounded-2xl border border-neutral-100 p-6 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    {user.account_type === 'company' ? L.b2bAccount : L.b2cAccount}
                  </h4>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                    <div>
                      <dt className="text-neutral-400 font-medium">{L.accountId}</dt>
                      <dd className="font-mono text-neutral-800 text-[11px] mt-0.5">{user.id}</dd>
                    </div>

                    <div>
                      <dt className="text-neutral-400 font-medium">{L.verifiedEmail}</dt>
                      <dd className="font-semibold text-neutral-900 mt-0.5">{user.email}</dd>
                    </div>

                    {user.account_type === 'company' ? (
                      <>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.companyName}</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.company_name}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.taxId}</dt>
                          <dd className="font-mono font-semibold text-neutral-900 mt-0.5">{user.tax_id}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.contactPerson}</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.contact_person || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.phone}</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.phone || '—'}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.fullName}</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">
                            {user.first_name} {user.last_name}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">{L.phone}</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.phone || '—'}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            )}

            {/* 2. Order History Tab (ISSUE-02 Fix: Real PostgreSQL orders in AMD) */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {isLoadingOrders ? (
                  <div className="py-12 flex items-center justify-center text-neutral-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="h-10 w-10 text-neutral-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-neutral-900">{L.noOrdersTitle}</p>
                    <p className="text-xs text-neutral-400 mt-1">{L.noOrdersSub}</p>
                  </div>
                ) : (
                  orders.map((ord) => (
                    <motion.div
                      key={ord.order_id}
                      whileHover={{ y: -2 }}
                      className="flex flex-col gap-3 rounded-2xl bg-white p-5 border border-neutral-100 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5F7F8] text-[#0D5257]">
                            <Truck className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-neutral-900">
                                #{ord.order_number}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {ord.status.toUpperCase()}
                              </span>
                              <span className="rounded-md bg-[#0D5257]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#0D5257]">
                                {ord.order_type}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {L.placedOn} {new Date(ord.created_at).toLocaleDateString()} •{' '}
                              {ord.items_count} {L.itemsLabel} • {ord.payment_method}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-black font-mono text-[#0D5257]">
                            {formatProductPrice(ord.grand_total, ord.currency || 'AMD')}
                          </span>
                        </div>
                      </div>

                      {ord.items && ord.items.length > 0 && (
                        <div className="border-t border-neutral-100 pt-2.5 space-y-1.5">
                          {ord.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs text-neutral-600"
                            >
                              <span className="truncate pr-2">
                                <strong className="font-mono text-neutral-800">{item.sku}</strong> —{' '}
                                {item.name} × {item.quantity} {item.unit_of_measure}
                              </span>
                              <span className="font-mono font-bold text-neutral-900 flex-shrink-0">
                                {formatProductPrice(item.total_price, ord.currency || 'AMD')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {/* 3. Saved Items (Wishlist) Tab (ISSUE-06 Fix: AMD formatting) */}
            {activeTab === 'wishlist' && (
              <div>
                {wishlist.length === 0 ? (
                  <div className="py-12 text-center">
                    <Heart className="h-10 w-10 text-neutral-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-neutral-900">{L.emptyWishlistTitle}</p>
                    <p className="text-xs text-neutral-400 mt-1">{L.emptyWishlistSub}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {wishlist.map((item) => {
                      const effectivePrice = getEffectiveUnitPrice(item, user);
                      return (
                        <motion.div
                          key={item.id}
                          whileHover={{ y: -3 }}
                          className="flex items-center justify-between gap-3.5 rounded-2xl bg-white p-4 border border-neutral-100 shadow-sm hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={item.thumbnailUrl || item.imageUrl}
                              alt={item.name}
                              className="h-14 w-14 rounded-xl bg-neutral-50 object-cover p-1 flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                {item.sku ? `#${item.sku}` : item.brand}
                              </span>
                              <h4 className="truncate text-xs font-semibold text-neutral-900 max-w-[170px]">
                                {item.name}
                              </h4>
                              <span className="text-xs font-extrabold font-mono text-[#0D5257]">
                                {formatProductPrice(effectivePrice, item.currency || 'AMD')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => onAddToCart(item)}
                              className="flex h-9 items-center gap-1.5 rounded-xl bg-[#DA291C] px-3 text-[11px] font-bold text-white shadow-sm hover:bg-[#b82216]"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              <span>{L.addBtn}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFromWishlist(item.id)}
                              className="rounded-xl p-2 text-neutral-400 hover:text-red-600 hover:bg-neutral-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
