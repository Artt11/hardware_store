import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, Lock, Mail, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AccountType, RegisterFormData } from '../../types/user';

const ARMENIAN_HVHH_REGEX = /^\d{8}$/;

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalMode, setAuthModalMode, login, register } =
    useAuth();
  const { t } = useLanguage();

  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (authModalMode === 'register' && accountType === 'company') {
      if (!ARMENIAN_HVHH_REGEX.test(taxId.trim())) {
        setError(t('errors.invalid_hvhh'));
        return;
      }
    }

    setIsLoading(true);

    try {
      if (authModalMode === 'login') {
        await login(email, password);
      } else {
        const payload: RegisterFormData = {
          account_type: accountType,
          email,
          password,
          first_name: accountType === 'individual' ? firstName : undefined,
          last_name: accountType === 'individual' ? lastName : undefined,
          company_name: accountType === 'company' ? companyName : undefined,
          tax_id: accountType === 'company' ? taxId.trim() : undefined,
          contact_person: accountType === 'company' ? contactPerson : undefined,
          phone: phone || undefined,
        };
        await register(payload);
      }
    } catch (err: any) {
      setError(err.message || t('errors.auth_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = (type: 'admin' | 'b2b') => {
    setError(null);
    if (type === 'admin') {
      setAuthModalMode('login');
      setEmail('admin@auratools.com');
      setPassword('AdminSecure2026!');
    } else {
      setAuthModalMode('login');
      setEmail('contractor@buildcorp.com');
      setPassword('BuildCorpSecure#1');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeAuthModal}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18)] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#0D5257]">
                {t('auth.security_badge')}
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">
                {authModalMode === 'login'
                  ? t('auth.sign_in_title')
                  : t('auth.create_account_title')}
              </h2>
            </div>
            <button
              type="button"
              aria-label={t('catalog.close_modal')}
              onClick={closeAuthModal}
              className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-black transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Error Message Box */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="my-3 flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-xs text-red-700"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Registration Dual Toggle: Individual vs Company */}
          {authModalMode === 'register' && (
            <div className="my-4 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1 select-none">
              <button
                type="button"
                onClick={() => setAccountType('individual')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                  accountType === 'individual'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>{t('auth.individual_tab')}</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountType('company')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                  accountType === 'company'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>{t('auth.company_tab')}</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {authModalMode === 'register' && accountType === 'individual' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    {t('auth.first_name_label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('auth.first_name_placeholder')}
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    {t('auth.last_name_label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('auth.last_name_placeholder')}
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                  />
                </div>
              </div>
            )}

            {authModalMode === 'register' && accountType === 'company' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    {t('auth.company_name_label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={t('auth.company_placeholder')}
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                      {t('auth.tax_id_label')}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={8}
                      pattern="\d{8}"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ''))}
                      placeholder="01234567"
                      className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 font-mono text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                      {t('auth.contact_person_label')}
                    </label>
                    <input
                      type="text"
                      required
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder={t('auth.contact_placeholder')}
                      className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    {t('auth.phone_label')}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+374 91 00-11-22"
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                {t('auth.email_label')}
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email_placeholder')}
                  className="w-full rounded-xl bg-neutral-50 pl-10 pr-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                {t('auth.password_label')}
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl bg-neutral-50 pl-10 pr-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-[#0D5257] transition-all"
                />
              </div>
              {authModalMode === 'register' && (
                <p className="mt-1 text-[10px] text-neutral-400">{t('auth.password_hint')}</p>
              )}
            </div>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#DA291C] py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216] transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : authModalMode === 'login' ? (
                t('auth.login_btn')
              ) : accountType === 'company' ? (
                t('auth.register_b2b_btn')
              ) : (
                t('auth.register_b2c_btn')
              )}
            </motion.button>
          </form>

          {/* Quick Demo Credentials for Reviewers */}
          <div className="mt-5 rounded-2xl bg-neutral-50 p-3 border border-neutral-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
              {t('auth.demo_title')}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDemoFill('admin')}
                className="flex-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-700 shadow-sm hover:text-black border border-neutral-200/60"
              >
                {t('auth.demo_b2c')}
              </button>
              <button
                type="button"
                onClick={() => handleDemoFill('b2b')}
                className="flex-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-[#0D5257] shadow-sm hover:text-black border border-neutral-200/60"
              >
                {t('auth.demo_b2b')}
              </button>
            </div>
          </div>

          {/* Switch Mode Footer */}
          <div className="mt-5 text-center text-xs text-neutral-500">
            {authModalMode === 'login' ? (
              <p>
                {t('auth.no_account')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthModalMode('register');
                  }}
                  className="font-bold text-[#0D5257] underline underline-offset-2 hover:opacity-80"
                >
                  {t('auth.create_now')}
                </button>
              </p>
            ) : (
              <p>
                {t('auth.has_account')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthModalMode('login');
                  }}
                  className="font-bold text-[#0D5257] underline underline-offset-2 hover:opacity-80"
                >
                  {t('auth.sign_in_link')}
                </button>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-neutral-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>{t('auth.security_footer')}</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
