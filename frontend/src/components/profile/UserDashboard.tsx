import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  User,
  Package,
  Heart,
  ShieldCheck,
  Building2,
  LogOut,
  ExternalLink,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  Truck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../hooks/useWishlist';
import { Product } from '../../types/product';
import { OrderHistoryItem } from '../../types/user';

interface UserDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

const SAMPLE_ORDERS: OrderHistoryItem[] = [
  {
    id: 'ord-901',
    order_number: 'AUR-8491024',
    date: '2026-10-28',
    status: 'delivered',
    total: 299.00,
    items_count: 1,
    tracking_number: '1Z9999999999999999',
    shipping_carrier: 'UPS Ground Express',
  },
  {
    id: 'ord-902',
    order_number: 'AUR-8490812',
    date: '2026-10-15',
    status: 'delivered',
    total: 768.50,
    items_count: 3,
    tracking_number: '9400100000000000000000',
    shipping_carrier: 'FedEx Freight Direct',
  },
];

export const UserDashboard: React.FC<UserDashboardProps> = ({ isOpen, onClose, onAddToCart }) => {
  const { user, logout } = useAuth();
  const { wishlist, removeFromWishlist } = useWishlist();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist'>('profile');

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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white font-black text-base shadow-sm">
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
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-neutral-500">
                    {user.account_type === 'company' ? 'B2B Enterprise Account' : 'Individual Account'}
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
                <span>Logout</span>
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
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <User className="h-4 w-4" />
              <span>Profile Info</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 ${
                activeTab === 'orders'
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Order History</span>
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.2 text-[10px] font-mono text-neutral-700">
                {SAMPLE_ORDERS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wishlist')}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 ${
                activeTab === 'wishlist'
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Heart className="h-4 w-4" />
              <span>Saved Items (Wishlist)</span>
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
                {/* Security Status Card with Antigravity Float */}
                <motion.div
                  whileHover={{ y: -4 }}
                  className="rounded-2xl bg-neutral-50 p-5 shadow-sm border border-neutral-100 transition-all hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                        Enterprise Session Security: Active
                      </span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      OWASP Level 3 Fortified
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-neutral-600 pt-2 border-t border-neutral-200/60">
                    <div>
                      <p className="font-semibold text-neutral-900">Access Token</p>
                      <p className="text-[11px] text-neutral-500">15-min in-memory memory storage (Zero XSS exposure)</p>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900">Refresh Token</p>
                      <p className="text-[11px] text-neutral-500">7-day HttpOnly, Secure, SameSite=Strict cookie</p>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900">Session Invalidation</p>
                      <p className="text-[11px] text-neutral-500">Global token revocation on logout & 15m inactivity lock</p>
                    </div>
                  </div>
                </motion.div>

                {/* Account Details Box */}
                <div className="rounded-2xl border border-neutral-100 p-6 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    {user.account_type === 'company' ? 'B2B Enterprise Credentials' : 'Personal Details'}
                  </h4>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                    <div>
                      <dt className="text-neutral-400 font-medium">Account ID</dt>
                      <dd className="font-mono text-neutral-800 text-[11px] mt-0.5">{user.id}</dd>
                    </div>

                    <div>
                      <dt className="text-neutral-400 font-medium">Verified Email</dt>
                      <dd className="font-semibold text-neutral-900 mt-0.5">{user.email}</dd>
                    </div>

                    {user.account_type === 'company' ? (
                      <>
                        <div>
                          <dt className="text-neutral-400 font-medium">Company Name</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.company_name}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">Tax ID / VAT Registration</dt>
                          <dd className="font-mono font-semibold text-neutral-900 mt-0.5">{user.tax_id}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">Authorized Contact Person</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.contact_person}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">Corporate Phone</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.phone || '—'}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt className="text-neutral-400 font-medium">Full Name</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">
                            {user.first_name} {user.last_name}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 font-medium">Phone</dt>
                          <dd className="font-semibold text-neutral-900 mt-0.5">{user.phone || '—'}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            )}

            {/* 2. Order History Tab */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {SAMPLE_ORDERS.map((ord) => (
                  <motion.div
                    key={ord.id}
                    whileHover={{ y: -4 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-5 border border-neutral-100 shadow-[0_4px_16px_rgba(0,0,0,0.02)] hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-neutral-900">{ord.order_number}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {ord.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Placed on {ord.date} • {ord.items_count} item(s) • {ord.shipping_carrier}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-500 mt-1">
                          Tracking: <span className="underline">{ord.tracking_number}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-neutral-100">
                      <span className="text-sm font-extrabold text-neutral-900">${ord.total.toFixed(2)}</span>
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-black"
                      >
                        <span>Invoice PDF</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* 3. Saved Items (Wishlist) Tab */}
            {activeTab === 'wishlist' && (
              <div>
                {wishlist.length === 0 ? (
                  <div className="py-12 text-center">
                    <Heart className="h-10 w-10 text-neutral-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-neutral-900">Your wishlist is empty</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Click the heart icon on any tool card to save items to your permanent profile.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {wishlist.map((item) => (
                      <motion.div
                        key={item.id}
                        whileHover={{ y: -6 }}
                        className="flex items-center justify-between gap-3.5 rounded-2xl bg-white p-4 border border-neutral-100 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-xl transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.thumbnailUrl || item.imageUrl}
                            alt={item.name}
                            className="h-14 w-14 rounded-xl bg-neutral-50 object-contain p-1 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              {item.brand}
                            </span>
                            <h4 className="truncate text-xs font-semibold text-neutral-900 max-w-[170px]">
                              {item.name}
                            </h4>
                            <span className="text-xs font-bold text-neutral-900">
                              ${item.price.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => onAddToCart(item)}
                            className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-3 text-[11px] font-bold text-white shadow-sm hover:bg-neutral-800"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                            <span>Add</span>
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
                    ))}
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
