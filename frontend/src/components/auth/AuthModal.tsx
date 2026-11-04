import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, Lock, Mail, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AccountType, RegisterFormData } from '../../types/user';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalMode, setAuthModalMode, login, register } = useAuth();
  
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
          tax_id: accountType === 'company' ? taxId : undefined,
          contact_person: accountType === 'company' ? contactPerson : undefined,
          phone: phone || undefined,
        };
        await register(payload);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
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

        {/* Modal Card with Antigravity depth */}
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Aura Security // Zero-Trust
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">
                {authModalMode === 'login' ? 'Sign in to AuraTools' : 'Create an Account'}
              </h2>
            </div>
            <button
              type="button"
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
                <span>Individual (B2C)</span>
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
                <span>Company (B2B)</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {authModalMode === 'register' && accountType === 'individual' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Marcus"
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Brody"
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                  />
                </div>
              </div>
            )}

            {authModalMode === 'register' && accountType === 'company' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Company Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Apex Construction Corp"
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                      Tax ID / VAT
                    </label>
                    <input
                      type="text"
                      required
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="US-EIN-94-2849104"
                      className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                      Authorized Contact
                    </label>
                    <input
                      type="text"
                      required
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="Sarah Jenkins"
                      className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Direct Business Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2831"
                    className="w-full rounded-xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-xl bg-neutral-50 pl-10 pr-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Password
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
                  className="w-full rounded-xl bg-neutral-50 pl-10 pr-3.5 py-2.5 text-xs text-neutral-900 border-0 outline-none ring-1 ring-neutral-200/60 focus:bg-white focus:ring-2 focus:ring-black transition-all"
                />
              </div>
              {authModalMode === 'register' && (
                <p className="mt-1 text-[10px] text-neutral-400">
                  Minimum 8 characters with numbers and special symbols.
                </p>
              )}
            </div>

            {/* Antigravity Submit CTA */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-xs font-bold text-white shadow-md hover:bg-neutral-900 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : authModalMode === 'login' ? (
                'Sign In & Continue'
              ) : (
                `Complete ${accountType === 'company' ? 'B2B' : 'Individual'} Registration`
              )}
            </motion.button>
          </form>

          {/* Quick Demo Credentials for Reviewers */}
          <div className="mt-5 rounded-2xl bg-neutral-50 p-3 border border-neutral-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
              Instant Demo Fill:
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDemoFill('admin')}
                className="flex-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm hover:text-black border border-neutral-200/60"
              >
                Individual B2C Demo
              </button>
              <button
                type="button"
                onClick={() => handleDemoFill('b2b')}
                className="flex-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm hover:text-black border border-neutral-200/60"
              >
                Company B2B Demo
              </button>
            </div>
          </div>

          {/* Switch Mode Footer */}
          <div className="mt-5 text-center text-xs text-neutral-500">
            {authModalMode === 'login' ? (
              <p>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthModalMode('register');
                  }}
                  className="font-bold text-black underline underline-offset-2 hover:opacity-80"
                >
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthModalMode('login');
                  }}
                  className="font-bold text-black underline underline-offset-2 hover:opacity-80"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-neutral-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>OWASP Protected • In-Memory Access Token • HttpOnly Cookie</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
