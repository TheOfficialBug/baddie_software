import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { toast } from '@/data/toast';

import { authActions, demoResetPending, useAuth } from '@/auth/authStore';
import { AuthError, MIN_PASSWORD, passwordProblem } from '@/auth/types';

import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { PageLoading } from '@/components/ui/PageLoading';

import { AuthLayout, FormError, PasswordInput } from '@/features/auth/AuthLayout';

/** Choose a new password: opened from the emailed reset link (which signs the person in for this). */
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const nav = useNavigate();
  const status = useAuth((s) => s.status);
  const demo = useAuth((s) => s.backend?.kind === 'demo');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <PageLoading />;
  const canReset = status === 'signedIn' || (demo && demoResetPending());
  if (!canReset) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once and expire after an hour. Ask for a new one.">
        <ButtonLink to="/forgot-password" variant="primary" size="lg" className="w-full">
          Send a new link
        </ButtonLink>
      </AuthLayout>
    );
  }

  const problem = passwordProblem(password);
  const mismatch = confirm !== password ? 'The passwords don’t match.' : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await authActions.updatePassword(password);
      toast('Password changed', { detail: 'Use it next time you sign in.' });
      nav('/account', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll use it to sign in from now on.">
      {error && <FormError>{error}</FormError>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          label="New password"
          hint={`At least ${MIN_PASSWORD} characters, with a number or symbol.`}
          error={touched ? (problem ?? undefined) : undefined}
        >
          {(id) => (
            <PasswordInput
              id={id}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              invalid={touched && !!problem}
            />
          )}
        </Field>
        <Field label="Repeat new password" error={touched ? mismatch : undefined}>
          {(id) => (
            <PasswordInput
              id={id}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              invalid={touched && !!mismatch}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
