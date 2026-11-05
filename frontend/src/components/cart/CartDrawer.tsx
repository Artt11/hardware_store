'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Truck,
  CheckCircle2,
  CreditCard,
  Banknote,
  FileText,
  Maximize2,
  Minimize2,
  AlertCircle,
} from 'lucide-react';
import { Product } from '../../types/product';
import { formatProductPrice } from '../product/ProductCard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { API_BASE_URL, getEffectiveUnitPrice } from '../../config/api';

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

type CheckoutStep = 'cart' | 'shipping' | 'payment' | 'review' | 'complete';

const PHONE_REGEX = /^\+?[0-9\s\-()]{8,18}$/;
const ARMENIAN_HVHH_REGEX = /^\d{8}$/;

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { user, accessToken } = useAuth();
  const { t, translateUnit } = useLanguage();

  const [step, setStep] = useState<CheckoutStep>('cart');
  const [isFullPage, setIsFullPage] = useState<boolean>(false);

  const [recipientName, setRecipientName] = useState(
    user?.first_name
      ? `${user.first_name} ${user.last_name || ''}`.trim()
      : `${t('auth.first_name_placeholder')} ${t('auth.last_name_placeholder')}`
  );
  const [phone, setPhone] = useState(user?.phone || '+374 91 00-00-00');
  const [city, setCity] = useState(t('checkout.default_city'));
  const [shippingAddress, setShippingAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'express' | 'pickup'>('express');

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'b2b_invoice'>('card');
  const [companyTaxId, setCompanyTaxId] = useState(user?.tax_id || '');

  const [stepValidationError, setStepValidationError] = useState<string | null>(null);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BUG-06 & ISSUE-08 Fix: Reset step, validation errors, and pending timers whenever the drawer closes
  useEffect(() => {
    if (!isOpen) {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
      setStep('cart');
      setStepValidationError(null);
      setCheckoutError(null);
    }
    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  // Sync B2B Tax ID / user details when authenticated user changes
  useEffect(() => {
    if (user?.tax_id) {
      setCompanyTaxId(user.tax_id);
    }
    if (user?.first_name) {
      setRecipientName(`${user.first_name} ${user.last_name || ''}`.trim());
    }
    if (user?.phone) {
      setPhone(user.phone);
    }
  }, [user]);

  // BUG-04 Fix: Apply B2B wholesale_price when user is a B2B company account
  const subtotal = items.reduce(
    (acc, item) => acc + getEffectiveUnitPrice(item.product, user) * item.quantity,
    0
  );
  const freeShippingThreshold = 50000;
  const shippingCost =
    deliveryMethod === 'pickup' || subtotal >= freeShippingThreshold || subtotal === 0
      ? 0
      : 2500;
  const grandTotal = subtotal + shippingCost;

  const handleStartCheckout = () => {
    setStepValidationError(null);
    setCheckoutError(null);
    setStep('shipping');
  };

  // BUG-02 Fix: Strict form validation for Step 1 (Shipping) using localized error messages
  const handleShippingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStepValidationError(null);

    if (recipientName.trim().length < 2) {
      setStepValidationError(t('errors.invalid_recipient'));
      return;
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      setStepValidationError(t('errors.invalid_phone'));
      return;
    }
    if (deliveryMethod === 'express') {
      if (city.trim().length < 2) {
        setStepValidationError(t('errors.invalid_city'));
        return;
      }
      if (shippingAddress.trim().length < 4) {
        setStepValidationError(t('errors.invalid_address'));
        return;
      }
    }

    setStep('payment');
  };

  // BUG-02 Fix: Strict form validation for Step 2 (Payment & 8-digit Armenian HVHH Tax ID)
  const handlePaymentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStepValidationError(null);

    if (paymentMethod === 'b2b_invoice') {
      const cleanTaxId = companyTaxId.trim();
      if (!ARMENIAN_HVHH_REGEX.test(cleanTaxId)) {
        setStepValidationError(t('errors.invalid_hvhh'));
        return;
      }
    }

    setStep('review');
  };

  // BUG-03 Fix: Send actual cart items to API; check !response.ok and never wipe cart on error
  const handlePlaceOrder = async () => {
    setCheckoutError(null);
    if (items.length === 0) {
      setCheckoutError(t('errors.empty_cart_checkout'));
      return;
    }

    setIsSubmitting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const payload = {
        recipient_name: recipientName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        shipping_address:
          deliveryMethod === 'pickup'
            ? t('cart.warehouse_pickup_address')
            : `${city.trim()}, ${shippingAddress.trim()}`,
        zip_code: '0001',
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
        company_tax_id: paymentMethod === 'b2b_invoice' ? companyTaxId.trim() : undefined,
        items: items.map(({ product, quantity }) => ({
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          unit_of_measure: product.unit_of_measure || 'հատ',
          quantity,
          unit_price: getEffectiveUnitPrice(product, user),
        })),
      };

      const response = await fetch(`${API_BASE_URL}/cart/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorDetail = t('errors.checkout_status', { status: response.status });
        try {
          const errJson = await response.json();
          if (typeof errJson.detail === 'string') {
            errorDetail = errJson.detail;
          } else if (Array.isArray(errJson.detail)) {
            errorDetail = errJson.detail.map((d: any) => d.msg).join(', ');
          }
        } catch {
          // Keep default localized status message
        }
        setCheckoutError(errorDetail);
        return;
      }

      const orderData = await response.json();
      setCompletedOrderNumber(orderData.order_number || 'SURO-000001');
      onClearCart();
      setStep('complete');
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
      }
      completeTimerRef.current = setTimeout(() => {
        setStep('cart');
        onClose();
      }, 3600);
    } catch (err: any) {
      setCheckoutError(err?.message || t('errors.checkout_network'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsIndicator = [
    { key: 'shipping', label: t('step1Shipping') },
    { key: 'payment', label: t('step2Payment') },
    { key: 'review', label: t('step3Review') },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`fixed inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl transition-all duration-300 ${
              isFullPage ? 'max-w-4xl' : 'max-w-md'
            }`}
          >
            {/* Header Bar */}
            <div className="flex items-center justify-between bg-[#0D5257] px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-extrabold uppercase tracking-wider">
                  {step === 'cart' ? t('shoppingCart') : t('checkoutTitle')}
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-xs font-bold">
                  {items.reduce((s, i) => s + i.quantity, 0)} {t('itemsCountUnit')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullPage((prev) => !prev)}
                  className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
                >
                  {isFullPage ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('catalog.close_modal')}
                  onClick={onClose}
                  className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {step !== 'cart' && step !== 'complete' && (
              <div className="grid grid-cols-3 bg-[#F5F7F8] px-6 py-3 border-b border-neutral-200/70">
                {stepsIndicator.map((st) => {
                  const active = step === st.key;
                  return (
                    <div
                      key={st.key}
                      className={`text-center text-xs font-extrabold ${
                        active ? 'text-[#0D5257]' : 'text-neutral-400'
                      }`}
                    >
                      {st.label}
                    </div>
                  );
                })}
              </div>
            )}

            {step === 'complete' ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-emerald-600 mb-4" />
                </motion.div>
                <h3 className="text-xl font-black text-[#0B0F17]">{t('orderConfirmedTitle')}</h3>
                <p className="mt-1 font-mono text-sm font-extrabold text-[#0D5257]">
                  {t('orderNumberLabel')} #{completedOrderNumber}
                </p>
                <p className="mt-2 text-xs text-neutral-500 max-w-xs leading-relaxed">
                  {t('orderConfirmedSub')}
                </p>
              </div>
            ) : step === 'shipping' ? (
              <form
                onSubmit={handleShippingSubmit}
                noValidate
                className="flex flex-1 flex-col justify-between overflow-y-auto p-6"
              >
                <div className="space-y-4">
                  <h3 className="text-base font-extrabold text-[#0B0F17]">
                    {t('step1Shipping')}
                  </h3>

                  {stepValidationError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{stepValidationError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('express')}
                      className={`flex flex-col items-start rounded-xl p-3.5 text-left transition-all ${
                        deliveryMethod === 'express'
                          ? 'bg-[#0D5257] text-white shadow-sm'
                          : 'bg-[#F5F7F8] text-[#0B0F17]'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{t('deliveryJobsite')}</span>
                      <span
                        className={`text-[11px] mt-0.5 ${
                          deliveryMethod === 'express' ? 'text-white/80' : 'text-neutral-500'
                        }`}
                      >
                        {subtotal >= freeShippingThreshold ? t('freeLabel') : '2,500 ֏'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`flex flex-col items-start rounded-xl p-3.5 text-left transition-all ${
                        deliveryMethod === 'pickup'
                          ? 'bg-[#0D5257] text-white shadow-sm'
                          : 'bg-[#F5F7F8] text-[#0B0F17]'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{t('pickupWarehouse')}</span>
                      <span
                        className={`text-[11px] mt-0.5 ${
                          deliveryMethod === 'pickup' ? 'text-white/80' : 'text-neutral-500'
                        }`}
                      >
                        {t('freeToday')}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                        {t('recipientNameLabel')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full rounded-xl bg-[#F5F7F8] px-3.5 py-2.5 text-xs font-semibold text-[#0B0F17] outline-none focus:ring-2 focus:ring-[#0D5257]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                        {t('phoneLabel')} *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-xl bg-[#F5F7F8] px-3.5 py-2.5 text-xs font-semibold text-[#0B0F17] outline-none focus:ring-2 focus:ring-[#0D5257]"
                      />
                    </div>
                  </div>

                  {deliveryMethod === 'express' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                          {t('cityLabel')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full rounded-xl bg-[#F5F7F8] px-3.5 py-2.5 text-xs font-semibold text-[#0B0F17] outline-none focus:ring-2 focus:ring-[#0D5257]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                          {t('addressLabel')} *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={t('checkout.manual_address_placeholder')}
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          className="w-full rounded-xl bg-[#F5F7F8] px-3.5 py-2.5 text-xs font-semibold text-[#0B0F17] outline-none focus:ring-2 focus:ring-[#0D5257]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStepValidationError(null);
                      setStep('cart');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F7F8] px-4 py-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{t('backBtn')}</span>
                  </button>
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#DA291C] py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216]"
                  >
                    <span>{t('continueToPayment')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : step === 'payment' ? (
              <form
                onSubmit={handlePaymentSubmit}
                noValidate
                className="flex flex-1 flex-col justify-between overflow-y-auto p-6"
              >
                <div className="space-y-4">
                  <h3 className="text-base font-extrabold text-[#0B0F17]">
                    {t('step2Payment')}
                  </h3>

                  {stepValidationError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{stepValidationError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('card');
                        setStepValidationError(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-4 text-left transition-all ${
                        paymentMethod === 'card'
                          ? 'bg-[#0D5257] text-white shadow-sm'
                          : 'bg-[#F5F7F8] text-[#0B0F17]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5" />
                        <div>
                          <div className="text-xs font-extrabold">{t('payCard')}</div>
                          <div
                            className={`text-[11px] ${
                              paymentMethod === 'card' ? 'text-white/80' : 'text-neutral-500'
                            }`}
                          >
                            {t('payCardSub')}
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('cash');
                        setStepValidationError(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-4 text-left transition-all ${
                        paymentMethod === 'cash'
                          ? 'bg-[#0D5257] text-white shadow-sm'
                          : 'bg-[#F5F7F8] text-[#0B0F17]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Banknote className="h-5 w-5" />
                        <div>
                          <div className="text-xs font-extrabold">{t('payCash')}</div>
                          <div
                            className={`text-[11px] ${
                              paymentMethod === 'cash' ? 'text-white/80' : 'text-neutral-500'
                            }`}
                          >
                            {t('payCashSub')}
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('b2b_invoice');
                        setStepValidationError(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-4 text-left transition-all ${
                        paymentMethod === 'b2b_invoice'
                          ? 'bg-[#0D5257] text-white shadow-sm'
                          : 'bg-[#F5F7F8] text-[#0B0F17]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5" />
                        <div>
                          <div className="text-xs font-extrabold">{t('payB2B')}</div>
                          <div
                            className={`text-[11px] ${
                              paymentMethod === 'b2b_invoice' ? 'text-white/80' : 'text-neutral-500'
                            }`}
                          >
                            {t('payB2BSub')}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {paymentMethod === 'b2b_invoice' && (
                    <div className="rounded-xl bg-[#F5F7F8] p-4">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                        {t('taxIdInputLabel')} ({t('cart.digits_hint')}) *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={8}
                        pattern="\d{8}"
                        value={companyTaxId}
                        onChange={(e) => setCompanyTaxId(e.target.value.replace(/\D/g, ''))}
                        placeholder="01234567"
                        className="w-full rounded-xl bg-white px-3.5 py-2.5 font-mono text-xs font-bold text-[#0B0F17] outline-none focus:ring-2 focus:ring-[#0D5257]"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStepValidationError(null);
                      setStep('shipping');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F7F8] px-4 py-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{t('backBtn')}</span>
                  </button>
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#DA291C] py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216]"
                  >
                    <span>{t('reviewOrderBtn')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : step === 'review' ? (
              <div className="flex flex-1 flex-col justify-between overflow-y-auto p-6">
                <div className="space-y-4">
                  <h3 className="text-base font-extrabold text-[#0B0F17]">
                    {t('step3Review')}
                  </h3>

                  {checkoutError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {items.map(({ product, quantity }) => {
                      const effectiveUnitPrice = getEffectiveUnitPrice(product, user);
                      return (
                        <div
                          key={product.id}
                          className="flex items-center justify-between rounded-xl bg-[#F5F7F8] px-3.5 py-2.5 text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="truncate font-bold text-[#0B0F17]">{product.name}</div>
                            <div className="font-mono text-[11px] text-neutral-500">
                              {t('skuLabel')}: {product.sku} • {quantity}{' '}
                              {translateUnit(product.unit_of_measure || 'հատ')}
                            </div>
                          </div>
                          <span className="font-mono font-extrabold text-[#0B0F17] flex-shrink-0">
                            {formatProductPrice(effectiveUnitPrice * quantity, product.currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl bg-[#0D5257]/5 p-4 space-y-2 text-xs">
                    <div className="flex justify-between text-neutral-600">
                      <span>{t('totalAmount')}</span>
                      <span className="font-mono font-bold">{subtotal.toLocaleString()} ֏</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-[#0B0F17] pt-2 border-t border-neutral-200">
                      <span>{t('confirmOrderBtn')}</span>
                      <span className="font-mono text-base text-[#0D5257]">
                        {grandTotal.toLocaleString()} ֏
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('payment')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F7F8] px-4 py-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{t('backBtn')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handlePlaceOrder}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#DA291C] py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216] disabled:opacity-50"
                  >
                    <span>
                      {t('confirmOrderBtn')} ({grandTotal.toLocaleString()} ֏)
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              /* DEFAULT VIEW: CART ITEMS */
              <div className="flex flex-1 flex-col justify-between overflow-hidden">
                {items.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#F5F7F8] flex items-center justify-center mb-3 text-[#0D5257]">
                      <Truck className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-extrabold text-[#0B0F17]">{t('emptyCartTitle')}</p>
                    <p className="mt-1 text-xs text-neutral-400">{t('emptyCartSubtitle')}</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-neutral-100">
                    <div className="rounded-xl bg-[#F5F7F8] p-3.5 text-xs">
                      {subtotal >= freeShippingThreshold ? (
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <Truck className="h-4 w-4" />
                          <span>{t('freeShippingUnlocked')}</span>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between text-neutral-600 font-semibold mb-1.5">
                            <span>
                              {t('addMoreForFreeShipping')}{' '}
                              {(freeShippingThreshold - subtotal).toLocaleString()} ֏
                            </span>
                            <span className="font-mono">
                              {Math.round((subtotal / freeShippingThreshold) * 100)}%
                            </span>
                          </div>
                          <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0D5257] transition-all"
                              style={{
                                width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {items.map(({ product, quantity }) => {
                      const unitPrice = getEffectiveUnitPrice(product, user);
                      return (
                        <div
                          key={product.id}
                          className="pt-4 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[#F5F7F8] p-1">
                              <img
                                src={product.thumbnailUrl || product.imageUrl}
                                alt={product.name}
                                className="h-full w-full object-cover rounded-lg"
                              />
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-xs font-extrabold text-[#0B0F17]">
                                {product.name}
                              </h4>
                              <p className="text-[11px] font-mono text-neutral-400">
                                {t('skuLabel')}: {product.sku} •{' '}
                                {formatProductPrice(unitPrice, product.currency)} /{' '}
                                {translateUnit(product.unit_of_measure || 'հատ')}
                              </p>
                              <span className="text-xs font-black text-[#0D5257] tabular-nums">
                                {formatProductPrice(unitPrice * quantity, product.currency)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 flex-shrink-0">
                            <div className="flex items-center rounded-xl bg-[#F5F7F8] p-1">
                              <button
                                type="button"
                                aria-label={t('catalog.qty_decrease')}
                                onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                                className="p-1 text-neutral-600 hover:text-black"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="px-2.5 text-xs font-mono font-extrabold text-[#0B0F17]">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                aria-label={t('catalog.qty_increase')}
                                onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                                className="p-1 text-neutral-600 hover:text-black"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              aria-label={t('cart.remove_item')}
                              onClick={() => onRemoveItem(product.id)}
                              className="text-neutral-400 hover:text-[#DA291C] transition-colors p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {items.length > 0 && (
                  <div className="border-t border-neutral-100 bg-[#F5F7F8] p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                        {t('totalAmount')}
                      </span>
                      <span className="text-xl font-black text-[#0B0F17] font-mono tabular-nums">
                        {subtotal.toLocaleString()} ֏
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartCheckout}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#DA291C] py-4 text-xs font-extrabold text-white shadow-lg hover:bg-[#b82216] transition-all"
                    >
                      <span>{t('proceedToCheckout')}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
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
