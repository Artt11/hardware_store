import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import type { RegisterPayload } from '../api/types';
import { useI18n } from '../i18n';
import { useAuth } from '../state/auth';
import { Modal } from './Modal';
import { Button, Field, Notice, cx } from './ui';

const HVHH = /^[0-9]{8}$/;

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxId, setTaxId] = useState('');
  const taxIdError = accountType === 'company' && taxId && !HVHH.test(taxId) ? t('auth.tax_id_invalid') : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (mode === 'register' && accountType === 'company' && !HVHH.test(taxId)) {
      setError(t('auth.tax_id_invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await login(form.email, form.password);
      } else {
        const payload: RegisterPayload = { account_type: accountType, email: form.email, password: form.password, phone: form.phone || undefined };
        if (accountType === 'company') Object.assign(payload, { company_name: form.company_name, tax_id: taxId, contact_person: form.contact_person });
        else Object.assign(payload, { first_name: form.first_name, last_name: form.last_name });
        await register(payload);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e, t('auth.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'signin' ? t('auth.signin') : t('auth.register')} closeLabel={t('common.close')}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate={false}>
        {mode === 'register' && (
          <div className="grid grid-cols-2 rounded-lg bg-canvas p-1 text-sm font-medium" role="radiogroup">
            {(['individual', 'company'] as const).map((type) => (
              <button key={type} type="button" role="radio" aria-checked={accountType === type} onClick={() => setAccountType(type)}
                className={cx('rounded-md py-2', accountType === type ? 'bg-white text-ink shadow-sm' : 'text-ink-soft')}>
                {t(`auth.${type}`)}
              </button>
            ))}
          </div>
        )}

        {mode === 'register' && accountType === 'individual' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('auth.first_name')} name="first_name" required maxLength={100} autoComplete="given-name" />
            <Field label={t('auth.last_name')} name="last_name" required maxLength={100} autoComplete="family-name" />
          </div>
        )}

        {mode === 'register' && accountType === 'company' && (
          <>
            <Field label={t('auth.company_name')} name="company_name" required maxLength={150} autoComplete="organization" />
            <Field
              label={t('auth.tax_id')}
              name="tax_id"
              required
              inputMode="numeric"
              maxLength={8}
              pattern="[0-9]{8}"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 8))}
              hint={t('auth.tax_id_hint')}
              error={taxIdError}
            />
            <Field label={t('auth.contact_person')} name="contact_person" required maxLength={100} autoComplete="name" />
          </>
        )}

        <Field label={t('auth.email')} name="email" type="email" required autoComplete="email" />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          required
          minLength={mode === 'register' ? 10 : 1}
          maxLength={72}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          hint={mode === 'register' ? t('auth.password_hint') : undefined}
        />
        {mode === 'register' && <Field label={t('auth.phone')} name="phone" type="tel" maxLength={20} autoComplete="tel" />}

        {mode === 'register' && accountType === 'company' && <Notice tone="info">{t('auth.company_note')}</Notice>}
        {error && <Notice>{error}</Notice>}

        <Button type="submit" block busy={busy}>
          {mode === 'signin' ? t('auth.submit_signin') : t('auth.submit_register')}
        </Button>

        <p className="text-center text-sm text-ink-soft">
          {mode === 'signin' ? t('auth.no_account') : t('auth.have_account')}{' '}
          <button type="button" className="font-semibold text-ink underline-offset-4 hover:underline"
            onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError(null); }}>
            {mode === 'signin' ? t('auth.register') : t('auth.signin')}
          </button>
        </p>
      </form>
    </Modal>
  );
}
