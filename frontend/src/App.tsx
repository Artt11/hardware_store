'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { API_BASE_URL } from './config/api';
import { getHighResFallbackImage } from './components/product/ProductCard';
import { useLanguage } from './context/LanguageContext';

const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 28,
  mass: 0.8,
};

const SPRING_DRAWER = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.9,
};

const CATEGORIES_DATA: Record<string, string[]> = {
  'Շինարարական նյութեր': [
    'Ամրացման ցանցեր',
    'Գիպսաստվարաթուղթ և պարագաններ',
    'Եռաթև բետոնե օղակներ հորաքներ',
    'Խաչուկներ և ՍՎՊ',
    'Հիդրոիզոլյացիա',
    'Ներկարարական սպառվող նյութեր',
    'Ներկեր և ծածկույթներ',
    'Չոր շինարարական խառնուրդներ',
    'Ջերմա և ձայնամեկուսացում',
    'Տանիքածածկ և ջրահեռացում',
    'Ցեմենտ և ծավալային նյութեր',
  ],
  'Ամրակման միջոցներ': ['3D Խաչուկ', '3D Սեպ', 'Պտուտակներ', 'Մեխեր', 'Անկերներ'],
  'Կտրող և հղկող գործիքներ': ['Դիսկ ալմազե', 'Դիսկ մետաղի', 'Շուշաթուղթ', 'Խոզանակ մետաղի'],
  'Ձեռքի գործիքներ': ['Բանալի', 'Տրիշոտկա', 'Ծեփիչ', 'Ատրճանակ սիլիկոնե', 'Պտուտակահան'],
  'Ներկարարական և քիմիա': ['Խոզանակ', 'Սկոչ', 'Ժապավեն', 'Ատրճանակ փրփուրի'],
  'Սանտեխնիկա և խողովակներ': [
    'Լվացարաններ',
    'Զուգարանակոնքեր',
    'Ծորակներ',
    'Խողովակներ',
    'Ֆիտինգներ',
  ],
  'Էլեկտրական գործիքներ': ['Պերֆորատոր', 'Մալուխներ', 'Վարդակներ և անջատիչներ', 'Գայլիկոններ'],
  'Չափիչ գործիքներ': ['Թել շինարարական', 'Մետր', 'Հարթաչափ'],
  'Անվտանգություն և հանդերձանք': ['Մասկա պաշտպանիչ', 'Դույլ', 'Թաս շինարարական', 'Ձեռնոցներ'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Շինարարական նյութեր': ['3d', 'խաչուկ', 'սեպ', 'դույլ', 'թաս', 'սկոչ', 'ժապավեն', 'թել'],
  'Խաչուկներ և ՍՎՊ': ['3d', 'խաչուկ', 'սեպ'],
  'Ներկարարական սպառվող նյութեր': ['խոզանակ', 'ծեփիչ', 'սկոչ', 'ժապավեն', 'շուշաթուղթ'],
  'Ներկեր և ծածկույթներ': ['ներկ', 'խոզանակ', 'ատրճանակ'],
  'Գործիքներ': ['բանալի', 'տրիշոտկա', 'դիսկ', 'ծեփիչ', 'ատրճանակ', 'նաժովկա'],
  'Ձեռքի գործիքներ': ['բանալի', 'տրիշոտկա', 'ծեփիչ', 'նաժովկա', 'կլեշ'],
  'Էլեկտրական գործիքներ': ['դիսկ', 'պերֆորատոր', 'մալուխ'],
  'Ամրացումներ': ['խաչուկ', 'սեպ', 'պտուտակ', 'մեխ'],
  'Սանտեխնիկա': ['ծորակ', 'խողովակ', 'լվացարան', 'փական'],
};

interface LavnaProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  wholesalePrice: number;
  unit: string;
  category: string;
  subCategory: string;
  image: string;
  barcode?: string | null;
}

interface LavnaCartItem extends LavnaProduct {
  qty: number;
}

interface LavnaUser {
  id?: string;
  name: string;
  phone: string;
  email: string;
}

interface LavnaOrder {
  order_number: string;
  grand_total: number;
  created_at: string;
  items_count: number;
}

const CART_STORAGE_KEY = 'lavna_cart_v1';
const WISHLIST_STORAGE_KEY = 'lavna_wishlist_v1';
const PAGE_SIZE = 48;

function mapRawToLavnaProduct(raw: any): LavnaProduct {
  const sku = String(raw.sku || '');
  const price =
    typeof raw.retail_price === 'number'
      ? raw.retail_price
      : typeof raw.base_price === 'number'
      ? raw.base_price
      : Number(raw.price || 0);
  const wholesalePrice = Number(raw.wholesale_price || 0);
  const category = String(raw.category || raw.category_name || 'Շինարարական նյութեր');
  const image =
    raw.primary_image_url ||
    raw.image_url ||
    raw.imageUrl ||
    raw.image ||
    getHighResFallbackImage(sku);

  return {
    id: String(raw.id || sku),
    sku,
    name: String(raw.name || ''),
    price,
    wholesalePrice,
    unit: String(raw.unit_of_measure || 'հատ'),
    category,
    subCategory: category,
    image,
    barcode: raw.barcode ? String(raw.barcode) : null,
  };
}

// ============================================================================
// MEMOIZED PRODUCT CARD WITH FLUID SPRING MICRO-INTERACTIONS & FULL I18N
// ============================================================================
const MemoizedProductCard = React.memo(function ProductCardItem({
  product,
  isWishlisted,
  priceLabel,
  addToCartLabel,
  addedLabel,
  translatedCategory,
  translatedUnit,
  wishlistAddAria,
  wishlistRemoveAria,
  qtyDecreaseAria,
  qtyIncreaseAria,
  onToggleWishlist,
  onAddToCart,
  onQuickView,
}: {
  product: LavnaProduct;
  isWishlisted: boolean;
  priceLabel: string;
  addToCartLabel: string;
  addedLabel: string;
  translatedCategory: string;
  translatedUnit: string;
  wishlistAddAria: string;
  wishlistRemoveAria: string;
  qtyDecreaseAria: string;
  qtyIncreaseAria: string;
  onToggleWishlist: (p: LavnaProduct) => void;
  onAddToCart: (p: LavnaProduct, qty?: number) => void;
  onQuickView: (p: LavnaProduct) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [justAdded, setJustAdded] = useState(false);
  const [qty, setQty] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product, qty);
    setJustAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setJustAdded(false);
      setQty(1);
    }, 1150);
  };

  return (
    <motion.article
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      whileHover={shouldReduceMotion ? undefined : { y: -6 }}
      transition={SPRING_SNAPPY}
      onClick={() => onQuickView(product)}
      className="product-card group cursor-pointer"
    >
      <div className="product-img-wrapper">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = getHighResFallbackImage(product.sku);
          }}
        />
        {product.sku && (
          <span
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(4px)',
              color: '#0f172a',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '7px',
              boxShadow: '0 2px 6px rgba(15,23,42,0.08)',
            }}
          >
            #{product.sku}
          </span>
        )}

        <motion.button
          type="button"
          aria-label={isWishlisted ? wishlistRemoveAria : wishlistAddAria}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.84 }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product);
          }}
          className="wishlist-icon-btn"
          style={{ color: isWishlisted ? '#e11d48' : '#64748b' }}
        >
          <i className={`${isWishlisted ? 'fa-solid' : 'fa-regular'} fa-heart`}></i>
        </motion.button>
      </div>

      <div className="product-info">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
                background: '#f1f5f9',
                padding: '2px 8px',
                borderRadius: '6px',
                maxWidth: '165px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {translatedCategory}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#059669',
              }}
            >
              • {translatedUnit}
            </span>
          </div>

          <h3 className="product-title" title={product.name}>
            {product.name}
          </h3>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <p className="product-price" style={{ margin: 0 }}>
              {product.price.toLocaleString()} {priceLabel}
            </p>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
              / {translatedUnit}
            </span>
          </div>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f1f5f9',
              borderRadius: '10px',
              padding: '2px',
            }}
          >
            <button
              type="button"
              aria-label={qtyDecreaseAria}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{
                width: '28px',
                height: '34px',
                border: 'none',
                background: 'transparent',
                fontWeight: 800,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              −
            </button>
            <span
              style={{
                minWidth: '22px',
                textAlign: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              {qty}
            </span>
            <button
              type="button"
              aria-label={qtyIncreaseAria}
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              style={{
                width: '28px',
                height: '34px',
                border: 'none',
                background: 'transparent',
                fontWeight: 800,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              +
            </button>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={handleAdd}
            className="add-to-cart-btn"
            style={{
              marginTop: 0,
              flex: 1,
              ...(justAdded ? { background: '#10b981', color: 'white' } : {}),
            }}
          >
            <i className={`fa-solid ${justAdded ? 'fa-check' : 'fa-cart-plus'}`}></i>
            <span>{justAdded ? addedLabel : addToCartLabel}</span>
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
});

export default function App() {
  const { lang, setLang, t, translateCategory, translateUnit } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeHoverCategory, setActiveHoverCategory] = useState('Շինարարական նյութեր');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);

  const [allProducts, setAllProducts] = useState<LavnaProduct[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [quickViewProduct, setQuickViewProduct] = useState<LavnaProduct | null>(null);

  const [cart, setCart] = useState<LavnaCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState<LavnaProduct[]>(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentView, setCurrentView] = useState<
    'home' | 'cart' | 'checkout' | 'auth' | 'dashboard' | 'wishlist'
  >('home');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [currentUser, setCurrentUser] = useState<LavnaUser | null>(null);
  const [profileTab, setProfileTab] = useState<'personal' | 'addresses' | 'orders'>('personal');
  const [orders, setOrders] = useState<LavnaOrder[]>([]);

  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderName, setOrderName] = useState('');
  const [orderLastName, setOrderLastName] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);

  const [showCardModal, setShowCardModal] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isCardAttached, setIsCardAttached] = useState(false);

  const [showOrderConfirmModal, setShowOrderConfirmModal] = useState(false);

  const [addresses, setAddresses] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');

  // Debounce search query by 180ms to avoid main-thread jank on 1,391 products
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Persist cart & wishlist in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  // Body scroll lock when any Drawer or Modal is open
  useEffect(() => {
    const anyModal =
      isCatalogOpen || showCardModal || showOrderConfirmModal || Boolean(quickViewProduct);
    document.body.style.overflow = anyModal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCatalogOpen, showCardModal, showOrderConfirmModal, quickViewProduct]);

  // Load full 1,391-product catalog (with the 78 extracted photos from Լավնա.xlsx)
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function loadCatalog() {
      setIsLoadingProducts(true);
      try {
        const res = await fetch('/products_catalog.json', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data) && data.length > 0) {
            setAllProducts(data.map(mapRawToLavnaProduct));
            setIsLoadingProducts(false);
            return;
          }
        }
      } catch {
        // fallback to API
      }

      try {
        const apiRes = await fetch(`${API_BASE_URL}/products?limit=250&offset=0`, {
          signal: controller.signal,
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          const items = Array.isArray(apiData) ? apiData : apiData.items || [];
          if (mounted) {
            setAllProducts(items.map(mapRawToLavnaProduct));
          }
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setIsLoadingProducts(false);
      }
    }

    loadCatalog();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const goToHome = useCallback(() => {
    setCurrentView('home');
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedCategory('all');
    setVisibleCount(PAGE_SIZE);
    setIsCatalogOpen(false);
  }, []);

  const selectCategoryFromCatalog = useCallback((catName: string) => {
    setSelectedCategory(catName);
    setVisibleCount(PAGE_SIZE);
    setIsCatalogOpen(false);
    setCurrentView('home');
  }, []);

  const addToCart = useCallback((product: LavnaProduct, quantityToAdd: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + quantityToAdd } : item
        );
      }
      return [...prev, { ...product, qty: quantityToAdd }];
    });
  }, []);

  const updateCartQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toggleWishlist = useCallback((product: LavnaProduct) => {
    setWishlist((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) {
        return prev.filter((item) => item.id !== product.id);
      }
      return [...prev, product];
    });
  }, []);

  const filteredProducts = allProducts.filter((item) => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      const translatedCat = translateCategory(item.category).toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        translatedCat.includes(q) ||
        (item.barcode || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    if (selectedCategory === 'all') return true;

    const selLower = selectedCategory.toLowerCase();
    const catLower = item.category.toLowerCase();
    const subCatLower = (item.subCategory || '').toLowerCase();
    const nameLower = item.name.toLowerCase();

    if (
      catLower === selLower ||
      subCatLower === selLower ||
      nameLower.includes(selLower) ||
      selLower.includes(catLower)
    ) {
      return true;
    }

    const keywords = CATEGORY_KEYWORDS[selectedCategory];
    if (keywords && keywords.some((kw) => nameLower.includes(kw.toLowerCase()))) {
      return true;
    }

    return false;
  });

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee = deliveryType === 'delivery' ? 1500 : 0;
  const grandTotal = cartTotal + (cart.length > 0 ? deliveryFee : 0);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: LavnaUser = {
      name: `${formName} ${formLastName}`.trim(),
      phone: formPhone,
      email: formEmail,
    };
    setCurrentUser(newUser);
    setOrderName(formName);
    setOrderLastName(formLastName);
    setOrderPhone(formPhone);
    setCurrentView('home');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const active: LavnaUser = {
      name: formName || `${t('auth.first_name_placeholder')} ${t('auth.last_name_placeholder')}`,
      phone: formPhone || '+374 94 55-68-67',
      email: formEmail || 'user@lavna.am',
    };
    setCurrentUser(active);
    setOrderName(active.name.split(' ')[0] || '');
    setOrderLastName(active.name.split(' ')[1] || '');
    setOrderPhone(active.phone);
    setCurrentView('home');
  };

  const addAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddress.trim()) return;
    setAddresses([...addresses, newAddress.trim()]);
    setNewAddress('');
  };

  const handleAttachCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
      return;
    }
    setIsCardAttached(true);
    setShowCardModal(false);
  };

  const handleConfirmOrder = async () => {
    setOrderError(null);
    if (cart.length === 0) return;

    const payload = {
      recipient_name:
        `${orderName} ${orderLastName}`.trim() ||
        currentUser?.name ||
        t('checkout.default_customer'),
      phone: orderPhone.trim() || currentUser?.phone || '+374 94 55-68-67',
      city: t('checkout.default_city'),
      shipping_address:
        deliveryType === 'pickup'
          ? t('checkout.pickup_option')
          : deliveryAddress.trim() || t('checkout.default_city'),
      zip_code: '0001',
      delivery_method: deliveryType === 'pickup' ? 'pickup' : 'express',
      payment_method: isCardAttached ? 'card' : 'cash',
      items: cart.map((item) => ({
        product_id: item.id,
        sku: item.sku,
        name: item.name,
        unit_of_measure: item.unit || 'հատ',
        quantity: item.qty,
        unit_price: item.price,
      })),
    };

    // Only a confirmed server response creates an order. On any failure the cart is kept,
    // the dialog closes, and the checkout page shows the reason (audit C4).
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/cart/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      setOrderError(t('errors.checkout_network'));
      setShowOrderConfirmModal(false);
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = typeof body?.detail === 'string' ? body.detail : null;
      setOrderError(detail ?? t('errors.checkout_status', { status: response.status }));
      setShowOrderConfirmModal(false);
      return;
    }

    const data = await response.json();
    setOrders((prev) => [
      {
        order_number: data.order_number,
        grand_total: Number(data.grand_total ?? grandTotal),
        created_at: new Date().toLocaleDateString(),
        items_count: cart.reduce((s, i) => s + i.qty, 0),
      },
      ...prev,
    ]);

    setCart([]);
    setShowOrderConfirmModal(false);
    goToHome();
  };

  return (
    <div>
      {/* ՎԵՐԵՎԻ ԲԱՑ ԴԵՂԻՆ ՀԱՏՎԱԾԸ (LAVNA SIGNATURE HEADER WITH FLUID MOTION & 100% I18N) */}
      <header className="header-container">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <motion.span
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={goToHome}
              className="logo"
            >
              <i className="fa-solid fa-hard-hat" style={{ color: '#d97706' }}></i>
              <span>LAVNA</span>
            </motion.span>

            {/* ԿԱՏԱԼՈԳԻ ԿՈՃԱԿ */}
            <div className="catalog-wrapper">
              <motion.button
                type="button"
                aria-expanded={isCatalogOpen}
                whileTap={{ scale: 0.96 }}
                onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                className="catalog-btn"
              >
                <i className="fa-solid fa-bars"></i>
                <span>{t('header.catalog')}</span>
                <motion.i
                  animate={{ rotate: isCatalogOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="fa-solid fa-chevron-down"
                />
              </motion.button>

              {/* SPRING-ANIMATED 2-COLUMN CATALOG DRAWER */}
              <AnimatePresence>
                {isCatalogOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setIsCatalogOpen(false)}
                    style={{
                      position: 'fixed',
                      top: '0',
                      left: '0',
                      width: '100vw',
                      height: '100vh',
                      background: 'rgba(15, 23, 42, 0.48)',
                      backdropFilter: 'blur(4px)',
                      zIndex: 1000,
                      display: 'flex',
                    }}
                  >
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '-100%' }}
                      transition={SPRING_DRAWER}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '760px',
                        maxWidth: '95vw',
                        height: '100vh',
                        background: 'white',
                        boxShadow: '12px 0 36px rgba(15, 23, 42, 0.22)',
                        display: 'flex',
                        flexDirection: 'row',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* ՁԱԽ ՍՅՈՒՆԱԿ */}
                      <div
                        style={{
                          width: '300px',
                          borderRight: '1px solid #e2e8f0',
                          padding: '22px',
                          overflowY: 'auto',
                          background: '#f8fafc',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '16px',
                            borderBottom: '1px solid #e2e8f0',
                            paddingBottom: '12px',
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                            {t('header.catalog')}
                          </h3>
                          <button
                            type="button"
                            aria-label={t('header.close_catalog')}
                            onClick={() => setIsCatalogOpen(false)}
                            style={{
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              fontSize: '16px',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => selectCategoryFromCatalog('all')}
                            style={{
                              textAlign: 'left',
                              background: selectedCategory === 'all' ? '#fef08a' : 'transparent',
                              border: 'none',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            {t('header.all_categories')} ({allProducts.length})
                          </button>
                          {Object.keys(CATEGORIES_DATA).map((cat, index) => (
                            <button
                              type="button"
                              key={index}
                              onMouseEnter={() => setActiveHoverCategory(cat)}
                              onClick={() => selectCategoryFromCatalog(cat)}
                              style={{
                                textAlign: 'left',
                                background:
                                  activeHoverCategory === cat ? '#fef08a' : 'transparent',
                                border: 'none',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#1e293b',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <span>{translateCategory(cat)}</span>
                              <i
                                className="fa-solid fa-chevron-right"
                                style={{ fontSize: '10px', color: '#64748b' }}
                              ></i>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ԱՋ ՍՅՈՒՆԱԿ */}
                      <div style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
                        <h3
                          style={{
                            marginTop: 0,
                            marginBottom: '20px',
                            fontSize: '20px',
                            fontWeight: 800,
                            color: '#0f172a',
                            borderBottom: '2px solid #fde047',
                            paddingBottom: '10px',
                          }}
                        >
                          {translateCategory(activeHoverCategory)}
                        </h3>
                        <motion.div
                          key={activeHoverCategory}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18 }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px',
                          }}
                        >
                          {CATEGORIES_DATA[activeHoverCategory]?.map((sub, idx) => (
                            <motion.button
                              type="button"
                              key={idx}
                              whileHover={{ y: -2, backgroundColor: '#fef9c3' }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => selectCategoryFromCatalog(sub)}
                              style={{
                                textAlign: 'left',
                                padding: '13px 16px',
                                background: '#f8fafc',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontSize: '13.5px',
                                fontWeight: 600,
                                color: '#1e293b',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {translateCategory(sub)}
                            </motion.button>
                          ))}
                        </motion.div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* SEARCH BOX WITH CLEAR BUTTON */}
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              aria-label={t('header.search_placeholder')}
              placeholder={t('header.search_placeholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
                if (currentView !== 'home') setCurrentView('home');
              }}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={t('header.clear_search')}
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedQuery('');
                }}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="header-actions">
            <div className="contact-wrapper">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setIsContactOpen(!isContactOpen)}
                className="contact-btn"
              >
                <i className="fa-solid fa-phone" style={{ color: '#d97706' }}></i>
                <span>{t('header.contact')}</span>
              </motion.button>
              <AnimatePresence>
                {isContactOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    className="contact-dropdown"
                  >
                    <a href="tel:+37494556867">📞 +374 94 55-68-67</a>
                    <a href="tel:+37493311171">📞 +374 93 31-11-71</a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setCurrentView('wishlist')}
              className="action-btn"
              title={t('header.wishlist')}
              aria-label={t('header.wishlist')}
            >
              <i className="fa-regular fa-heart"></i>
              {wishlist.length > 0 && <span className="badge">{wishlist.length}</span>}
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setCurrentView('cart')}
              className="action-btn"
              title={t('header.cart')}
              aria-label={t('header.cart')}
            >
              <i className="fa-solid fa-cart-shopping"></i>
              {cart.length > 0 && (
                <span className="badge">{cart.reduce((s, i) => s + i.qty, 0)}</span>
              )}
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (currentUser) {
                  setCurrentView('dashboard');
                } else {
                  setCurrentView('auth');
                  setAuthMode('register');
                }
              }}
              className="action-btn"
              title={t('header.profile')}
              aria-label={t('header.profile')}
            >
              <i className="fa-regular fa-user"></i>
            </motion.button>

            <div className="lang-switcher" role="group" aria-label={t('header.lang_select')}>
              <button
                type="button"
                onClick={() => setLang('hy')}
                className={lang === 'hy' ? 'active' : ''}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={lang === 'ru' ? 'active' : ''}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={lang === 'en' ? 'active' : ''}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 1. ԳԼԽԱՎՈՐ ԷՋ (ԱՊՐԱՆՔՆԵՐ) */}
      {currentView === 'home' && (
        <main className="main-content">
          {/* Quick Category Pills Bar */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '12px',
              marginBottom: '18px',
            }}
          >
            <button
              type="button"
              onClick={() => selectCategoryFromCatalog('all')}
              style={{
                flexShrink: 0,
                background: selectedCategory === 'all' ? '#0f172a' : 'white',
                color: selectedCategory === 'all' ? 'white' : '#334155',
                border: '1px solid #e2e8f0',
                padding: '8px 15px',
                borderRadius: '9999px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('header.all_categories')} ({allProducts.length})
            </button>
            {Object.keys(CATEGORIES_DATA).map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => selectCategoryFromCatalog(cat)}
                  style={{
                    flexShrink: 0,
                    background: active ? '#fde047' : 'white',
                    color: '#0f172a',
                    border: active ? '1px solid #eab308' : '1px solid #e2e8f0',
                    padding: '8px 15px',
                    borderRadius: '9999px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {translateCategory(cat)}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              {selectedCategory === 'all'
                ? t('catalog.featured_title')
                : translateCategory(selectedCategory)}
              <span
                style={{
                  marginLeft: '10px',
                  fontSize: '14px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  color: '#64748b',
                }}
              >
                ({filteredProducts.length})
              </span>
            </h2>
            {(selectedCategory !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={goToHome}
                style={{
                  background: '#fef08a',
                  border: '1px solid #facc15',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('catalog.clear_filters')}
              </button>
            )}
          </div>

          {/* ZERO-CLS SHIMMER SKELETON GRID */}
          {isLoadingProducts ? (
            <div className="products-grid" aria-busy="true">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="product-card" style={{ pointerEvents: 'none' }}>
                  <div className="product-img-wrapper skeleton-shimmer" />
                  <div className="product-info">
                    <div>
                      <div
                        className="skeleton-shimmer"
                        style={{
                          height: '14px',
                          width: '45%',
                          borderRadius: '6px',
                          marginBottom: '10px',
                        }}
                      />
                      <div
                        className="skeleton-shimmer"
                        style={{
                          height: '16px',
                          width: '90%',
                          borderRadius: '6px',
                          marginBottom: '6px',
                        }}
                      />
                      <div
                        className="skeleton-shimmer"
                        style={{
                          height: '20px',
                          width: '55%',
                          borderRadius: '6px',
                          marginTop: '12px',
                        }}
                      />
                    </div>
                    <div
                      className="skeleton-shimmer"
                      style={{
                        height: '40px',
                        width: '100%',
                        borderRadius: '10px',
                        marginTop: '14px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                textAlign: 'center',
                padding: '64px 20px',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
              }}
            >
              <i
                className="fa-solid fa-box-open"
                style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '15px' }}
              ></i>
              <p
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#0f172a',
                  margin: '0 0 14px 0',
                }}
              >
                {t('catalog.empty_products')}
              </p>
              <button
                type="button"
                onClick={goToHome}
                style={{
                  background: '#fde047',
                  border: '1px solid #eab308',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {t('catalog.clear_filters')}
              </button>
            </motion.div>
          ) : (
            <>
              <motion.div layout className="products-grid">
                <AnimatePresence mode="popLayout">
                  {displayedProducts.map((product) => {
                    const isWishlisted = wishlist.some((item) => item.id === product.id);
                    return (
                      <MemoizedProductCard
                        key={product.id}
                        product={product}
                        isWishlisted={isWishlisted}
                        priceLabel={t('catalog.currency')}
                        addToCartLabel={t('catalog.add_to_cart')}
                        addedLabel={t('catalog.added_to_cart')}
                        translatedCategory={translateCategory(product.category)}
                        translatedUnit={translateUnit(product.unit)}
                        wishlistAddAria={t('catalog.wishlist_add')}
                        wishlistRemoveAria={t('catalog.wishlist_remove')}
                        qtyDecreaseAria={t('catalog.qty_decrease')}
                        qtyIncreaseAria={t('catalog.qty_increase')}
                        onToggleWishlist={toggleWishlist}
                        onAddToCart={addToCart}
                        onQuickView={setQuickViewProduct}
                      />
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {visibleCount < filteredProducts.length && (
                <div style={{ textAlign: 'center', marginTop: '34px' }}>
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                    style={{
                      background: '#fde047',
                      color: '#0f172a',
                      border: '1px solid #eab308',
                      padding: '13px 32px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px -6px rgba(234, 179, 8, 0.45)',
                    }}
                  >
                    {t('catalog.load_more')} ({filteredProducts.length - visibleCount})
                  </motion.button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* QUICK-VIEW PRODUCT DETAIL MODAL (SPRING MOTION) */}
      <AnimatePresence>
        {quickViewProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQuickViewProduct(null)}
            className="modal-backdrop"
            style={{ justifyContent: 'center', alignItems: 'center', padding: '16px' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={SPRING_SNAPPY}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white',
                borderRadius: '20px',
                maxWidth: '760px',
                width: '100%',
                overflow: 'hidden',
                boxShadow: '0 28px 60px -15px rgba(15, 23, 42, 0.35)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                position: 'relative',
              }}
            >
              <button
                type="button"
                aria-label={t('catalog.close_modal')}
                onClick={() => setQuickViewProduct(null)}
                style={{
                  position: 'absolute',
                  top: '14px',
                  right: '14px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  zIndex: 10,
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
                }}
              >
                <img
                  src={quickViewProduct.image}
                  alt={quickViewProduct.name}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = getHighResFallbackImage(
                      quickViewProduct.sku
                    );
                  }}
                  style={{
                    maxHeight: '280px',
                    width: '100%',
                    objectFit: 'contain',
                    borderRadius: '12px',
                  }}
                />
              </div>

              <div
                style={{
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <span
                      style={{
                        background: '#fef08a',
                        color: '#0f172a',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      {translateCategory(quickViewProduct.category)}
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#64748b',
                      }}
                    >
                      {t('catalog.sku_label')} #{quickViewProduct.sku}
                    </span>
                  </div>

                  <h2
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: '#0f172a',
                      margin: '0 0 12px 0',
                    }}
                  >
                    {quickViewProduct.name}
                  </h2>

                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '26px',
                      fontWeight: 900,
                      color: '#d97706',
                      marginBottom: '16px',
                    }}
                  >
                    {quickViewProduct.price.toLocaleString()} {t('catalog.currency')}{' '}
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                      / {translateUnit(quickViewProduct.unit)}
                    </span>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: '12px',
                      padding: '14px',
                      border: '1px solid #e2e8f0',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>{t('catalog.unit_label')}</span>
                      <strong>{translateUnit(quickViewProduct.unit)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>{t('catalog.status_label')}</span>
                      <strong style={{ color: '#059669' }}>✓ {t('catalog.in_stock_badge')}</strong>
                    </div>
                    {quickViewProduct.barcode && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>{t('catalog.barcode_label')}</span>
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {quickViewProduct.barcode}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      addToCart(quickViewProduct, 1);
                      setQuickViewProduct(null);
                    }}
                    className="add-to-cart-btn"
                    style={{ marginTop: 0, flex: 1, padding: '13px' }}
                  >
                    <i className="fa-solid fa-cart-plus"></i>
                    <span>{t('catalog.add_to_cart')}</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ՀԱՎԱՆԱԾՆԵՐԻ ԷՋ (WISHLIST) */}
      {currentView === 'wishlist' && (
        <main className="main-content">
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '20px' }}>
            <i className="fa-solid fa-heart" style={{ color: '#e11d48', marginRight: '8px' }}></i>
            {t('header.wishlist')} ({wishlist.length})
          </h2>
          {wishlist.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '56px 20px',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
              }}
            >
              <p style={{ color: '#64748b', fontSize: '15px' }}>{t('wishlist.empty')}</p>
              <button
                type="button"
                onClick={goToHome}
                style={{
                  background: '#fde047',
                  border: 'none',
                  padding: '11px 22px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  marginTop: '10px',
                }}
              >
                {t('wishlist.go_shopping')}
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {wishlist.map((product) => (
                <MemoizedProductCard
                  key={product.id}
                  product={product}
                  isWishlisted={true}
                  priceLabel={t('catalog.currency')}
                  addToCartLabel={t('catalog.add_to_cart')}
                  addedLabel={t('catalog.added_to_cart')}
                  translatedCategory={translateCategory(product.category)}
                  translatedUnit={translateUnit(product.unit)}
                  wishlistAddAria={t('catalog.wishlist_add')}
                  wishlistRemoveAria={t('catalog.wishlist_remove')}
                  qtyDecreaseAria={t('catalog.qty_decrease')}
                  qtyIncreaseAria={t('catalog.qty_increase')}
                  onToggleWishlist={toggleWishlist}
                  onAddToCart={addToCart}
                  onQuickView={setQuickViewProduct}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {/* 2. ԶԱՄԲՅՈՒՂԻ ԷՋ */}
      {currentView === 'cart' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          style={{
            maxWidth: '900px',
            margin: '40px auto',
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 8px 30px -8px rgba(15, 23, 42, 0.08)',
            border: '1px solid #e2e8f0',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: 800,
            }}
          >
            <i className="fa-solid fa-cart-shopping"></i> {t('cart.title')}
          </h2>

          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
              <i
                className="fa-solid fa-basket-shopping"
                style={{ fontSize: '42px', marginBottom: '12px', color: '#cbd5e1' }}
              ></i>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>
                {t('cart.empty')}
              </p>
              <button
                type="button"
                onClick={goToHome}
                style={{
                  background: '#fde047',
                  border: '1px solid #eab308',
                  padding: '11px 24px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  marginTop: '12px',
                  color: '#0f172a',
                }}
              >
                {t('cart.go_shopping')}
              </button>
            </div>
          ) : (
            <div>
              <AnimatePresence initial={false}>
                {cart.map((item) => (
                  <motion.div
                    layout
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      marginBottom: '15px',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: '15px',
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getHighResFallbackImage(
                          item.sku
                        );
                      }}
                      style={{
                        width: '72px',
                        height: '72px',
                        objectFit: 'cover',
                        borderRadius: '10px',
                        background: '#f8fafc',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                        {item.name}
                      </h4>
                      <p
                        style={{
                          fontSize: '14px',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#d97706',
                          fontWeight: 800,
                          margin: '5px 0 0',
                        }}
                      >
                        {item.price.toLocaleString()} {t('catalog.currency')} × {item.qty} ={' '}
                        {(item.price * item.qty).toLocaleString()} {t('catalog.currency')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        aria-label={t('catalog.qty_decrease')}
                        onClick={() => updateCartQty(item.id, -1)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          fontWeight: 800,
                        }}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 800,
                          minWidth: '24px',
                          textAlign: 'center',
                        }}
                      >
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={t('catalog.qty_increase')}
                        onClick={() => updateCartQty(item.id, 1)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          fontWeight: 800,
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '6px',
                      }}
                      title={t('cart.remove_item')}
                      aria-label={t('cart.remove_item')}
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '30px',
                  borderTop: '2px solid #e2e8f0',
                  paddingTop: '20px',
                }}
              >
                <span
                  style={{
                    fontSize: '19px',
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {t('cart.total')} {cartTotal.toLocaleString()} {t('catalog.currency')}
                </span>
                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setCurrentView('checkout')}
                  style={{
                    background: '#0f172a',
                    color: 'white',
                    border: 'none',
                    padding: '14px 28px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '15px',
                  }}
                >
                  {t('cart.checkout_button')}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* 3. ՊԱՏՎԵՐԻ ՁԵՎԱԿԵՐՊՄԱՆ ԷՋ */}
      {currentView === 'checkout' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          style={{ maxWidth: '1200px', margin: '30px auto', padding: '0 20px' }}
        >
          <h2
            style={{
              textAlign: 'center',
              marginBottom: '30px',
              color: '#0f172a',
              fontWeight: 800,
            }}
          >
            {t('checkout.page_title')}
          </h2>

          {orderError && (
            <div
              style={{
                background: '#fef2f2',
                color: '#b91c1c',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontWeight: 'bold',
              }}
            >
              {orderError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '380px',
                background: 'white',
                padding: '22px',
                borderRadius: '16px',
                boxShadow: '0 4px 20px -4px rgba(15,23,42,0.06)',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '10px',
                  fontSize: '16px',
                  fontWeight: 800,
                }}
              >
                {t('checkout.selected_items')}
              </h3>
              <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '15px' }}>
                {cart.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      marginBottom: '12px',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: '8px',
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      style={{
                        width: '50px',
                        height: '50px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 700 }}>{item.name}</h4>
                      <p
                        style={{
                          fontSize: '13px',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#d97706',
                          fontWeight: 'bold',
                          margin: '4px 0 0',
                        }}
                      >
                        {item.price.toLocaleString()} × {item.qty}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '15px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    marginBottom: '8px',
                    color: '#64748b',
                  }}
                >
                  <span>{t('checkout.items_subtotal')}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {cartTotal.toLocaleString()} {t('catalog.currency')}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    marginBottom: '8px',
                    color: '#64748b',
                  }}
                >
                  <span>{t('checkout.delivery_fee')}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {deliveryFee.toLocaleString()} {t('catalog.currency')}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '15px',
                    fontWeight: 800,
                    borderTop: '1px solid #cbd5e1',
                    paddingTop: '8px',
                    color: '#0f172a',
                  }}
                >
                  <span>{t('checkout.grand_total')}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {grandTotal.toLocaleString()} {t('catalog.currency')}
                  </span>
                </div>
              </div>

              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowOrderConfirmModal(true)}
                style={{
                  width: '100%',
                  background: '#fde047',
                  color: '#0f172a',
                  border: '1px solid #eab308',
                  padding: '14px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  marginTop: '20px',
                  fontSize: '15px',
                }}
              >
                {t('checkout.confirm_order')}
              </motion.button>
            </div>

            <div
              style={{
                flex: 1,
                minWidth: '320px',
                background: 'white',
                padding: '30px',
                borderRadius: '16px',
                boxShadow: '0 4px 20px -4px rgba(15,23,42,0.06)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ marginBottom: '25px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 800,
                    marginBottom: '10px',
                    fontSize: '14px',
                  }}
                >
                  {t('checkout.delivery_method_label')}
                </label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="radio"
                      name="deliveryType"
                      checked={deliveryType === 'delivery'}
                      onChange={() => setDeliveryType('delivery')}
                    />
                    {t('checkout.delivery_option')}
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="radio"
                      name="deliveryType"
                      checked={deliveryType === 'pickup'}
                      onChange={() => setDeliveryType('pickup')}
                    />
                    {t('checkout.pickup_option')}
                  </label>
                </div>
              </div>

              {deliveryType === 'delivery' && (
                <div style={{ marginBottom: '25px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 800,
                      marginBottom: '8px',
                      fontSize: '14px',
                    }}
                  >
                    {t('checkout.map_label')}
                  </label>
                  <div
                    style={{
                      width: '100%',
                      height: '180px',
                      background: '#e2e8f0',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      marginBottom: '12px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&q=80"
                      alt="Map"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.7,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        background: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      {t('checkout.map_badge')}
                    </span>
                  </div>

                  <label
                    style={{
                      display: 'block',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      fontSize: '13px',
                      color: '#64748b',
                    }}
                  >
                    {t('checkout.manual_address_label')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('checkout.manual_address_placeholder')}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  marginBottom: '25px',
                  background: '#f8fafc',
                  padding: '15px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '14px', fontWeight: 800 }}>
                      {t('checkout.payment_card_title')}
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      {isCardAttached
                        ? t('checkout.card_attached')
                        : t('checkout.card_not_attached')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) {
                        setCurrentView('auth');
                        setAuthMode('login');
                      } else {
                        setShowCardModal(true);
                      }
                    }}
                    style={{
                      background: '#0f172a',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {t('checkout.attach_card_btn')}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '15px',
                  marginBottom: '15px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      fontSize: '13px',
                      color: '#64748b',
                    }}
                  >
                    {t('checkout.first_name')}
                  </label>
                  <input
                    type="text"
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder={t('checkout.first_name')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      fontSize: '13px',
                      color: '#64748b',
                    }}
                  >
                    {t('checkout.last_name')}
                  </label>
                  <input
                    type="text"
                    value={orderLastName}
                    onChange={(e) => setOrderLastName(e.target.value)}
                    placeholder={t('checkout.last_name')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 'bold',
                    marginBottom: '5px',
                    fontSize: '13px',
                    color: '#64748b',
                  }}
                >
                  {t('checkout.phone')}
                </label>
                <input
                  type="text"
                  value={orderPhone}
                  onChange={(e) => setOrderPhone(e.target.value)}
                  placeholder={t('checkout.phone_placeholder')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 'bold',
                    marginBottom: '5px',
                    fontSize: '13px',
                    color: '#64748b',
                  }}
                >
                  {t('checkout.delivery_date')}
                </label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 'bold',
                    marginBottom: '5px',
                    fontSize: '13px',
                    color: '#64748b',
                  }}
                >
                  {t('checkout.delivery_service')}
                </label>
                <input
                  type="text"
                  disabled
                  placeholder={t('checkout.not_selected')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 'bold',
                    marginBottom: '5px',
                    fontSize: '13px',
                    color: '#64748b',
                  }}
                >
                  {t('checkout.notes_label')}
                </label>
                <textarea
                  rows={3}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder={t('checkout.notes_placeholder')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                    resize: 'none',
                  }}
                ></textarea>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ՔԱՐՏԻ ԿՑՄԱՆ ՄՈԴԱԼ (SPRING ANIMATED) */}
      <AnimatePresence>
        {showCardModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={SPRING_SNAPPY}
              style={{
                background: 'white',
                padding: '30px',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '400px',
                position: 'relative',
                boxShadow: '0 24px 48px -12px rgba(15,23,42,0.28)',
              }}
            >
              <button
                type="button"
                aria-label={t('catalog.close_modal')}
                onClick={() => setShowCardModal(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontWeight: 800 }}>
                {t('checkout.card_modal_title')}
              </h3>
              <form onSubmit={handleAttachCardSubmit}>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('checkout.card_number')}
                  </label>
                  <input
                    type="text"
                    placeholder="XXXX XXXX XXXX XXXX"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        marginBottom: '5px',
                        color: '#64748b',
                      }}
                    >
                      {t('checkout.card_expiry')}
                    </label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        marginBottom: '5px',
                        color: '#64748b',
                      }}
                    >
                      {t('checkout.card_cvv')}
                    </label>
                    <input
                      type="password"
                      placeholder="123"
                      maxLength={3}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    background: '#fde047',
                    color: '#0f172a',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  {t('checkout.card_submit')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ՊԱՏՎԵՐԻ ՀԱՍՏԱՏՄԱՆ ՄՈԴԱԼ (SPRING ANIMATED) */}
      <AnimatePresence>
        {showOrderConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={SPRING_SNAPPY}
              style={{
                background: 'white',
                padding: '30px',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '380px',
                textAlign: 'center',
                boxShadow: '0 24px 48px -12px rgba(15,23,42,0.28)',
              }}
            >
              <p
                style={{
                  fontWeight: 800,
                  fontSize: '17px',
                  marginBottom: '20px',
                  color: '#0f172a',
                }}
              >
                {t('checkout.confirm_order')}
              </p>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button
                  type="button"
                  onClick={handleConfirmOrder}
                  style={{
                    flex: 1,
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '11px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {t('checkout.yes')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOrderConfirmModal(false)}
                  style={{
                    flex: 1,
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    padding: '11px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {t('checkout.no')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. ՄՈՒՏՔԻ / ԳՐԱՆՑՄԱՆ ԷՋ */}
      {currentView === 'auth' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          style={{
            maxWidth: '450px',
            margin: '40px auto',
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 8px 30px -8px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
          }}
        >
          {authMode === 'login' ? (
            <div>
              <h2
                style={{
                  textAlign: 'center',
                  marginBottom: '20px',
                  color: '#0f172a',
                  fontWeight: 800,
                }}
              >
                {t('auth.login_title')}
              </h2>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '15px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.phone_label')}
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.password_label')}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    background: '#fde047',
                    color: '#0f172a',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginBottom: '15px',
                  }}
                >
                  {t('auth.login_btn')}
                </button>
              </form>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                {t('auth.no_account')}{' '}
                <span
                  onClick={() => setAuthMode('register')}
                  style={{
                    color: '#0f172a',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('auth.register_btn')}
                </span>
              </p>
            </div>
          ) : (
            <div>
              <h2
                style={{
                  textAlign: 'center',
                  marginBottom: '5px',
                  color: '#0f172a',
                  fontWeight: 800,
                }}
              >
                {t('auth.register_title')}
              </h2>
              <form onSubmit={handleRegister}>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.first_name_label')}*
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.last_name_label')}*
                  </label>
                  <input
                    type="text"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.phone_label')}*
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.email_label')}*
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '5px',
                      color: '#64748b',
                    }}
                  >
                    {t('auth.password_label')}*
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    background: '#fde047',
                    color: '#0f172a',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginBottom: '15px',
                  }}
                >
                  {t('auth.register_btn')}
                </button>
              </form>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                {t('auth.has_account')}{' '}
                <span
                  onClick={() => setAuthMode('login')}
                  style={{
                    color: '#0f172a',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('auth.login_btn')}
                </span>
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* 5. ՕԳՏԱՏԻՐՈՋ ԱՄԲՈՂՋԱԿԱՆ ԷՋԸ (DASHBOARD) */}
      {currentView === 'dashboard' && currentUser && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          style={{
            maxWidth: '1000px',
            margin: '30px auto',
            background: 'white',
            padding: '30px',
            borderRadius: '16px',
            boxShadow: '0 8px 30px -8px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            gap: '40px',
            position: 'relative',
          }}
        >
          <div style={{ width: '250px', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>
            <h3
              style={{
                margin: '0 0 20px 0',
                fontSize: '16px',
                color: '#0f172a',
                fontWeight: 800,
              }}
            >
              {t('dashboard.welcome')} {currentUser.name}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setProfileTab('personal')}
                style={{
                  textAlign: 'left',
                  background: profileTab === 'personal' ? '#fde047' : 'none',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('dashboard.tab_personal')}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('addresses')}
                style={{
                  textAlign: 'left',
                  background: profileTab === 'addresses' ? '#fde047' : 'none',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('dashboard.tab_addresses')}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('orders')}
                style={{
                  textAlign: 'left',
                  background: profileTab === 'orders' ? '#fde047' : 'none',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('dashboard.tab_orders')} ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#ef4444',
                  marginTop: '20px',
                }}
              >
                {t('dashboard.logout')}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            {showLogoutConfirm && (
              <div
                style={{
                  position: 'absolute',
                  inset: '0',
                  background: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20,
                  textAlign: 'center',
                }}
              >
                <p style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '20px' }}>
                  {t('dashboard.logout_confirm')}
                </p>
                <div style={{ display: 'flex', gap: '15px', width: '100%', maxWidth: '250px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentUser(null);
                      setCurrentView('auth');
                      setAuthMode('login');
                      setShowLogoutConfirm(false);
                    }}
                    style={{
                      flex: 1,
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {t('checkout.yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    style={{
                      flex: 1,
                      background: '#cbd5e1',
                      color: '#0f172a',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {t('checkout.no')}
                  </button>
                </div>
              </div>
            )}

            {profileTab === 'personal' && (
              <div>
                <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
                  {t('dashboard.tab_personal')}
                </h2>
                <div style={{ marginBottom: '25px' }}>
                  <h4
                    style={{
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: '#334155',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: '8px',
                    }}
                  >
                    {t('dashboard.personal_details')}
                  </h4>
                  <p style={{ fontSize: '14px', color: '#64748b', margin: '10px 0' }}>
                    {t('dashboard.full_name_label')} <strong>{currentUser.name}</strong>
                  </p>
                  <p style={{ fontSize: '14px', color: '#64748b', margin: '10px 0' }}>
                    {t('dashboard.phone_label')} {currentUser.phone}
                  </p>
                  <p style={{ fontSize: '14px', color: '#64748b', margin: '10px 0' }}>
                    {t('dashboard.email_label')} {currentUser.email}
                  </p>
                </div>
              </div>
            )}

            {profileTab === 'addresses' && (
              <div>
                <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
                  {t('dashboard.delivery_addresses_title')}
                </h2>
                <div style={{ marginBottom: '20px' }}>
                  {addresses.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                      {t('dashboard.no_addresses')}
                    </p>
                  ) : (
                    addresses.map((addr, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#f8fafc',
                          padding: '12px',
                          borderRadius: '8px',
                          marginBottom: '10px',
                          fontSize: '14px',
                        }}
                      >
                        📍 {addr}
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={addAddress}>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        marginBottom: '5px',
                        color: '#64748b',
                      }}
                    >
                      {t('dashboard.add_new_address_label')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('dashboard.address_placeholder')}
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      background: '#fde047',
                      color: '#0f172a',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {t('dashboard.add_address_btn')}
                  </button>
                </form>
              </div>
            )}

            {profileTab === 'orders' && (
              <div>
                <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
                  {t('dashboard.your_orders_title')}
                </h2>
                {orders.length === 0 ? (
                  <p style={{ fontSize: '14px', color: '#64748b' }}>{t('dashboard.no_orders')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {orders.map((ord, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#f8fafc',
                          padding: '14px 18px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 'bold',
                              fontFamily: "'JetBrains Mono', monospace",
                              color: '#0f172a',
                            }}
                          >
                            #{ord.order_number}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                            {ord.created_at} •{' '}
                            {t('dashboard.items_count', { count: ord.items_count })}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 'bold',
                            fontFamily: "'JetBrains Mono', monospace",
                            color: '#d97706',
                            fontSize: '15px',
                          }}
                        >
                          {ord.grand_total.toLocaleString()} {t('catalog.currency')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
