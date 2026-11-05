'use client';

import React from 'react';
import { Phone, Mail, MapPin, ShieldCheck, Truck, Clock, Building2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface FooterProps {
  totalProducts?: number;
  onSelectCategory?: (category: string | null) => void;
  onOpenB2BRegister?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  totalProducts = 1391,
  onSelectCategory,
  onOpenB2BRegister,
}) => {
  const { t, translateCategory } = useLanguage();

  return (
    <footer className="mt-24 bg-[#093B3F] text-white">
      {/* Value Proposition Strip */}
      <div className="border-b border-white/10 bg-[#0D5257]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#FFAB00]">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                {t('footerFastDelivery')}
              </h4>
              <p className="mt-0.5 text-xs text-white/75">{t('footerFastDeliverySub')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#FFAB00]">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                {t('footerB2BTitle')}
              </h4>
              <p className="mt-0.5 text-xs text-white/75">{t('footerB2BSub')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#FFAB00]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                {totalProducts.toLocaleString()} {t('footerStockTitle')}
              </h4>
              <p className="mt-0.5 text-xs text-white/75">{t('footerStockSub')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#FFAB00]">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                {t('footerHoursTitle')}
              </h4>
              <p className="mt-0.5 text-xs text-white/75">{t('footerHoursSub')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Columns */}
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand Column */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DA291C] text-white font-black text-base">
                Ս
              </div>
              <span className="text-lg font-black tracking-tight">
                SURO<span className="font-light text-[#FFAB00]">BUILD</span>
              </span>
            </div>
            <p className="mt-4 text-xs text-white/70 leading-relaxed">{t('footerAbout')}</p>
            <div className="mt-5 space-y-2 text-xs text-white/80">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-[#FFAB00]" />
                <span>{t('storeLocation')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[#FFAB00]" />
                <span>+374 (10) 55-00-00</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#FFAB00]" />
                <span>info@surobuild.am</span>
              </div>
            </div>
          </div>

          {/* Popular Departments */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FFAB00] mb-4">
              {t('footerDeptsTitle')}
            </h4>
            <ul className="space-y-2.5 text-xs text-white/80">
              {[
                'Ամրակման միջոցներ',
                'Կտրող և հղկող գործիքներ',
                'Ձեռքի գործիքներ',
                'Ներկարարական և քիմիա',
                'Սանտեխնիկա և խողովակներ',
                'Էլեկտրական գործիքներ',
              ].map((cat) => (
                <li key={cat}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCategory?.(cat);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {translateCategory(cat)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FFAB00] mb-4">
              {t('footerSupportTitle')}
            </h4>
            <ul className="space-y-2.5 text-xs text-white/80">
              <li>{t('fastDeliveryBanner')}</li>
              <li>{t('footerB2BTitle')}</li>
              <li>{t('footerStockSub')}</li>
              <li>{t('footerHoursSub')}</li>
            </ul>
          </div>

          {/* B2B Contractor Callout */}
          <div className="rounded-2xl bg-white/5 p-5">
            <span className="inline-block rounded bg-[#DA291C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {t('footerB2BCardBadge')}
            </span>
            <h4 className="mt-2 text-sm font-extrabold text-white">
              {t('footerB2BCardTitle')}
            </h4>
            <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
              {t('footerB2BCardSub')}
            </p>
            <button
              type="button"
              onClick={onOpenB2BRegister}
              className="mt-4 w-full rounded-xl bg-[#FFAB00] py-2.5 text-xs font-extrabold text-[#0B0F17] hover:bg-[#ffc13b] transition-colors"
            >
              {t('footerB2BCardBtn')}
            </button>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/60">
          <p>{t('footerRights')}</p>
          <p className="font-mono">ARM • RUS • ENG | PostgreSQL 16 • FastAPI</p>
        </div>
      </div>
    </footer>
  );
};
