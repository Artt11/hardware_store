import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Lock,
  Building2,
  User,
  AlertCircle
} from 'lucide-react';
import { Product } from '../../types/product';
import { useAuth } from '../../context/AuthContext';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { isAuthenticated, user, accessToken, openAuthModal } = useAuth();
  
  const [zipCode, setZipCode] = useState('94103');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('100 Market St, Suite 400');
  const [orderComplete, setOrderComplete] = useState(false);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Financial calculations
  const subtotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const freeShippingThreshold = 99;
  const shipping = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : 9.99;
  const estimatedTax = subtotal * 0.0825; // 8.25% average sales tax
  const grandTotal = subtotal + shipping + estimatedTax;

  // Enforce strictly protected checkout
  const handleProceedToCheckout = () => {
    if (!isAuthenticated) {
      // Trigger login modal and queue resuming checkout upon success
      openAuthModal('login', () => {
        setIsCheckingOut(true);
      });
    } else {
      setIsCheckingOut(true);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !accessToken) {
      openAuthModal('login');
      return;
    }

    setCheckoutError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('http://localhost:8000/api/v1/cart/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`, // Bearer token kept strictly in memory
        },
        body: JSON.stringify({
          shipping_address: shippingAddress,
          zip_code: zipCode,
          payment_method: 'card',
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to place order.');
      }

      const orderData = await response.json();
      setCompletedOrderNumber(orderData.order_number);
      setOrderComplete(true);

      setTimeout(() => {
        onClearCart();
        setIsCheckingOut(false);
        setOrderComplete(false);
        onClose();
      }, 3500);
    } catch (err: any) {
      setCheckoutError(err.message || 'Checkout failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Slide-over panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  {isCheckingOut ? 'Protected Checkout' : 'Shopping Cart'}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  ({items.reduce((s, i) => s + i.quantity, 0)} items)
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-neutral-400 hover:text-black transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {orderComplete ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-emerald-600 mb-4" />
                </motion.div>
                <h3 className="text-lg font-bold text-neutral-900">Order Confirmed!</h3>
                <p className="mt-1 text-xs font-mono font-bold text-neutral-700">
                  Order #{completedOrderNumber || 'AUR-849201'}
                </p>
                <p className="mt-2 text-xs text-neutral-500 max-w-xs">
                  Confirmation sent to{' '}
                  <strong className="text-neutral-900">{user?.email}</strong>. Track your order anytime in your Profile.
                </p>
              </div>
            ) : isCheckingOut ? (
              /* Strictly Protected Registered Checkout View */
              <form onSubmit={handlePlaceOrder} className="flex flex-1 flex-col justify-between overflow-y-auto p-6">
                <div className="space-y-4">
                  {checkoutError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  {/* Authenticated User / B2B Profile Card */}
                  <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        Verified Account
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <ShieldCheck className="h-3 w-3" />
                        Authenticated
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-bold text-neutral-900">
                      {user?.account_type === 'company' ? (
                        <>
                          <Building2 className="h-4 w-4" />
                          <span>{user.company_name}</span>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4" />
                          <span>{user?.first_name} {user?.last_name}</span>
                        </>
                      )}
                    </div>
                    <p className="text-neutral-500 mt-0.5">{user?.email}</p>
                    {user?.account_type === 'company' && user.tax_id && (
                      <p className="text-[11px] font-mono text-neutral-600 mt-1">
                        Tax ID: {user.tax_id} (Commercial invoice attached)
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                      Delivery Destination
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Street address"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                        Postal / ZIP Code
                      </label>
                      <input
                        type="text"
                        required
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                        Shipping Tier
                      </label>
                      <div className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-semibold text-neutral-800">
                        {shipping === 0 ? 'Free Express' : 'Standard ($9.99)'}
                      </div>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="rounded-2xl bg-neutral-50 p-4 space-y-2 text-xs border border-neutral-100">
                    <div className="flex justify-between text-neutral-500">
                      <span>Subtotal</span>
                      <span className="font-mono">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Automated Shipping</span>
                      <span className="font-mono">{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Estimated Tax (8.25%)</span>
                      <span className="font-mono">${estimatedTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-neutral-900 pt-2 border-t border-neutral-200">
                      <span>Total Amount</span>
                      <span className="font-mono">${grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 space-y-2">
                  <motion.button
                    type="submit"
                    disabled={isSubmitting}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full rounded-xl bg-black py-3.5 text-xs font-bold text-white shadow-md hover:bg-neutral-900 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Processing Payment...' : `Authorize & Pay $${grandTotal.toFixed(2)}`}
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => setIsCheckingOut(false)}
                    className="w-full py-2 text-center text-xs font-medium text-neutral-500 hover:text-black"
                  >
                    Back to Items
                  </button>
                </div>
              </form>
            ) : (
              /* Cart Items List */
              <div className="flex flex-1 flex-col justify-between overflow-hidden">
                {items.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-neutral-100 flex items-center justify-center mb-3 text-neutral-400">
                      <Truck className="h-6 w-6 stroke-1" />
                    </div>
                    <p className="text-sm font-semibold text-neutral-900">Your cart is empty</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      Explore professional power tools and hand equipment.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-neutral-100">
                    {/* Free shipping progress bar */}
                    <div className="rounded-xl bg-neutral-50 p-3 text-xs">
                      {subtotal >= freeShippingThreshold ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <Truck className="h-4 w-4" />
                          <span>You qualified for Free Shipping!</span>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between text-neutral-600 mb-1">
                            <span>Add ${(freeShippingThreshold - subtotal).toFixed(2)} for Free Shipping</span>
                            <span>{Math.round((subtotal / freeShippingThreshold) * 100)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-black transition-all"
                              style={{ width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {items.map(({ product, quantity }) => (
                      <div key={product.id} className="pt-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-neutral-50 p-1">
                            <img
                              src={product.thumbnailUrl || product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-xs font-semibold text-neutral-900">
                              {product.name}
                            </h4>
                            <p className="text-[11px] text-neutral-400">SKU: {product.sku}</p>
                            <span className="text-xs font-bold text-neutral-900">
                              ${product.price.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Quantity Controls & Remove */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="flex items-center rounded-lg border border-neutral-200">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                              className="p-1 text-neutral-400 hover:text-black"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2 text-xs font-mono font-bold text-neutral-900">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                              className="p-1 text-neutral-400 hover:text-black"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(product.id)}
                            className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer Checkout Trigger - Strictly Protected */}
                {items.length > 0 && (
                  <div className="border-t border-neutral-100 p-6 space-y-3 bg-neutral-50/50">
                    <div className="flex justify-between text-xs text-neutral-500">
                      <span>Subtotal</span>
                      <span className="font-mono font-bold text-neutral-900">
                        ${subtotal.toFixed(2)}
                      </span>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleProceedToCheckout}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-xs font-bold text-white shadow-md hover:bg-neutral-900 transition-all"
                    >
                      {!isAuthenticated ? (
                        <>
                          <Lock className="h-3.5 w-3.5 text-neutral-400" />
                          <span>Sign In to Checkout (Protected)</span>
                        </>
                      ) : (
                        <>
                          <span>Proceed to Checkout</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>

                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-400 pt-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{isAuthenticated ? 'Authenticated session' : 'Registered users only'} • OWASP fortified</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
