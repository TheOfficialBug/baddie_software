import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { authActions, useAuth } from '@/auth/authStore';
import { AuthError, EMAIL_RE } from '@/auth/types';

import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

import { AuthLayout, FormError } from '@/features/auth/AuthLayout';

/** Ask for a password-reset link. Always shows the same confirmation, so it doesn't reveal which emails have accounts. */
export function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const demo = useAuth((s) => s.backend?.kind === 'demo');
  const invalid = !EMAIL_RE.test(email.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await authActions.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          <>
            If <strong className="text-fg">{email.trim()}</strong> has an account, a reset link is on its way.
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg">
            <Icon name="mail" size={26} />
          </span>
          <p className="text-[14.5px] text-muted">The link opens a page where you choose a new password. It expires after an hour.</p>
          {demo && (
            <ButtonLink to="/reset-password" variant="primary">
              Open the reset link (demo)
            </ButtonLink>
          )}
          <ButtonLink to="/login" variant="secondary">
            Back to sign in
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
      footer={
        <Link to="/login" className="inline-flex min-h-11 items-center gap-1 font-semibold hover:text-fg">
          <Icon name="left" size={16} /> Back to sign in
        </Link>
      }
    >
      {error && <FormError>{error}</FormError>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={touched && invalid ? 'Enter a valid email address.' : undefined}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={(touched && invalid) || undefined}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
