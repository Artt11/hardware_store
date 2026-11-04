import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, ShoppingBag, ShieldCheck, Truck, RefreshCw, ZoomIn } from 'lucide-react';
import { Product } from '../../types/product';
import { useWishlist } from '../../hooks/useWishlist';
import { StickyCartBar } from './StickyCartBar';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomCoords, setZoomCoords] = useState({ x: 50, y: 50 });
  const [showStickyBar, setShowStickyBar] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mainCtaRef = useRef<HTMLButtonElement>(null);

  if (!product) return null;

  const isSaved = isInWishlist(product.id);

  // High-res gallery images
  const gallery = [
    product.imageUrl,
    product.thumbnailUrl,
    'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=800&q=80',
  ];

  // Detect scroll to show sticky "Add to Cart" bar
  const handleScroll = () => {
    if (scrollContainerRef.current && mainCtaRef.current) {
      const ctaRect = mainCtaRef.current.getBoundingClientRect();
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      // If main CTA has scrolled past the viewport of modal
      setShowStickyBar(ctaRect.bottom < containerRect.top);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomCoords({ x, y });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-full sm:h-[92vh] w-full max-w-5xl flex-col overflow-hidden bg-white sm:rounded-3xl shadow-2xl z-10"
          >
            {/* Top Close Bar */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
              <span className="text-xs font-mono uppercase tracking-widest text-neutral-400">
                Aura Professional Series // {product.sku}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content Container */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-6 py-8"
            >
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
                
                {/* Left: High-Res Zoomable Gallery */}
                <div className="flex flex-col gap-4">
                  <div
                    onMouseEnter={() => setIsZoomed(true)}
                    onMouseLeave={() => setIsZoomed(false)}
                    onMouseMove={handleMouseMove}
                    className="relative flex h-96 w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-50/70 p-6 cursor-crosshair border border-neutral-100"
                  >
                    <img
                      src={gallery[selectedImageIndex]}
                      alt={product.name}
                      className={`h-full w-full object-contain transition-transform duration-200 ${
                        isZoomed ? 'scale-150' : 'scale-100'
                      }`}
                      style={
                        isZoomed
                          ? { transformOrigin: `${zoomCoords.x}% ${zoomCoords.y}%` }
                          : undefined
                      }
                    />

                    {/* Floating Zoom Indicator */}
                    <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-medium text-neutral-600 backdrop-blur-sm shadow-sm">
                      <ZoomIn className="h-3.5 w-3.5" />
                      <span>Hover to Zoom</span>
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {gallery.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`h-16 w-16 flex-shrink-0 rounded-xl bg-neutral-50 p-1.5 border transition-all ${
                          selectedImageIndex === idx
                            ? 'border-black ring-2 ring-black/10'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <img src={img} alt="" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Product Specs & Purchase Column */}
                <div className="flex flex-col justify-between">
                  <div>
                    {/* Brand & Stock Pill */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                        {product.brand}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          product.inStock
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${product.inStock ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                        {product.inStock ? `In Stock (${product.stockQuantity} units)` : 'Backordered'}
                      </span>
                    </div>

                    <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
                      {product.name}
                    </h1>

                    <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                      {product.description ||
                        product.shortDescription ||
                        `Կոդ: ${product.sku} • Չափման միավոր: ${product.unit_of_measure || 'հատ'}${
                          product.barcode ? ` • Գծիկավոր կոդ: ${product.barcode}` : ''
                        }`}
                    </p>

                    {/* Price Header (Displays retail_price by default) */}
                    <div className="mt-6 flex flex-col gap-1">
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-extrabold text-neutral-900">
                          {product.currency === 'AMD'
                            ? `${Number(product.retail_price ?? product.price).toLocaleString('en-US', { maximumFractionDigits: 0 })} ֏`
                            : `$${Number(product.retail_price ?? product.price).toFixed(2)}`}
                        </span>
                        <span className="text-sm font-medium text-neutral-400">
                          / {product.unit_of_measure || 'հատ'}
                        </span>
                        {product.compareAtPrice && product.compareAtPrice > (product.retail_price ?? product.price) && (
                          <span className="text-base text-neutral-400 line-through">
                            {product.currency === 'AMD'
                              ? `${product.compareAtPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} ֏`
                              : `$${product.compareAtPrice.toFixed(2)}`}
                          </span>
                        )}
                      </div>
                      {product.wholesale_price > 0 && (
                        <span className="text-xs font-semibold text-neutral-500">
                          Մեծածախ գին՝ {Number(product.wholesale_price).toLocaleString('en-US', { maximumFractionDigits: 0 })} ֏
                        </span>
                      )}
                    </div>

                    {/* Technical Specification Table */}
                    <div className="mt-8 rounded-2xl bg-neutral-50 p-5 border border-neutral-100">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                        Technical Specifications
                      </h4>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                        {Object.entries(product.specifications).map(([key, val]) => (
                          <div key={key} className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                            <dt className="text-neutral-500 capitalize">{key.replace('_', ' ')}</dt>
                            <dd className="font-semibold text-neutral-900">{val}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                          <dt className="text-neutral-500">Warranty</dt>
                          <dd className="font-semibold text-neutral-900">3-Year Limited</dd>
                        </div>
                      </dl>
                    </div>

                    {/* Trust Badges */}
                    <div className="mt-6 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-5 text-center text-[11px] text-neutral-500">
                      <div className="flex flex-col items-center gap-1">
                        <Truck className="h-4 w-4 text-black" />
                        <span>Free 2-Day Shipping</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <ShieldCheck className="h-4 w-4 text-black" />
                        <span>Guaranteed Authentic</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <RefreshCw className="h-4 w-4 text-black" />
                        <span>30-Day Hassle Free</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Action CTAs */}
                  <div className="mt-8 flex items-center gap-3 pt-4 border-t border-neutral-100">
                    <motion.button
                      ref={mainCtaRef}
                      type="button"
                      disabled={!product.inStock}
                      onClick={() => onAddToCart(product)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-xs font-bold text-white shadow-md hover:bg-neutral-900 transition-all disabled:bg-neutral-200 disabled:text-neutral-400"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span>
                        Add to Cart —{' '}
                        {product.currency === 'AMD'
                          ? `${Number(product.retail_price ?? product.price).toLocaleString('en-US', { maximumFractionDigits: 0 })} ֏`
                          : `$${Number(product.retail_price ?? product.price).toFixed(2)}`}
                      </span>
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => toggleWishlist(product)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 hover:border-black transition-colors"
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          isSaved ? 'fill-red-500 text-red-500' : 'text-neutral-700'
                        }`}
                      />
                    </motion.button>
                  </div>
                </div>

              </div>
            </div>

            {/* Sticky Cart Bar when user scrolls past the main CTA */}
            <StickyCartBar
              product={product}
              visible={showStickyBar}
              onAddToCart={onAddToCart}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
