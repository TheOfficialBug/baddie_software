import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/config/demo';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { authActions, useAuth } from '@/auth/authStore';
import { homeFor, safeNext } from '@/auth/redirects';
import { AuthError, EMAIL_RE, MIN_PASSWORD, passwordProblem } from '@/auth/types';
import { useAccess } from '@/auth/useAccess';

import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';

import { AuthLayout, FormError, GoogleButton, OrDivider, PasswordInput } from '@/features/auth/AuthLayout';

type Mode = 'signin' | 'signup';

const messageOf = (e: unknown) => (e instanceof AuthError ? e.message : 'Something went wrong. Try again.');

/** Sign in or create an account: Google, or email and password. */
export function LoginPage() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const next = safeNext(params.get('next'));
  useDocumentTitle(mode === 'signup' ? 'Create account' : 'Sign in');
  const status = useAuth((s) => s.status);
  const backend = useAuth((s) => s.backend);
  const { isOrganizer } = useAccess();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  useEffect(() => setError(null), [mode]);

  // Signed in (now or already): continue to where they were going.
  if (status === 'signedIn') return <Navigate to={next ?? homeFor(isOrganizer)} replace />;

  const errors = {
    name: mode === 'signup' && name.trim().length < 2 ? 'Enter your name.' : undefined,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined,
    password: mode === 'signup' ? (passwordProblem(password) ?? undefined) : !password ? 'Enter your password.' : undefined,
  };
  const shown: Partial<typeof errors> = touched ? errors : {};

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.email || errors.password) return;
    void run(async () => {
      if (mode === 'signin') {
        await authActions.signIn(email, password);
      } else {
        const r = await authActions.signUp({ name, email, password }, next ?? '/');
        if (r.needsConfirmation) setConfirmSent(email.trim());
      }
    });
  };

  const setMode = (m: Mode) => {
    const p = new URLSearchParams(params);
    if (m === 'signup') p.set('mode', 'signup');
    else p.delete('mode');
    setParams(p, { replace: true });
    setTouched(false);
  };

  if (confirmSent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          <>
            We sent a confirmation link to <strong className="text-fg">{confirmSent}</strong>.
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg">
            <Icon name="mail" size={26} />
          </span>
          <p className="text-[14.5px] text-muted">
            Open it on this device to finish creating your account. It can take a minute to arrive; check spam too.
          </p>
          <Button variant="secondary" onClick={() => setConfirmSent(null)}>
            Use a different email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const demo = backend?.kind === 'demo';
  return (
    <AuthLayout
      title={mode === 'signup' ? 'Create your account' : 'Welcome back'}
      subtitle={mode === 'signup' ? 'Enter tournaments and follow your matches.' : 'Sign in to see your matches or run the desk.'}
      footer={
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 font-semibold hover:text-fg">
          <Icon name="left" size={16} /> Back to tournaments
        </Link>
      }
    >
      <Segmented
        label="Account"
        stretch
        value={mode}
        onChange={setMode}
        options={[
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ]}
        className="mb-5"
      />

      {mode === 'signup' && (
        <p className="-mt-2 mb-4 text-[14px] text-muted">
          Here to play? Player accounts are opening soon:{' '}
          <Link to="/waitlist" className="font-semibold text-fg underline underline-offset-4">
            join the waitlist
          </Link>
          .
        </p>
      )}
      {error && <FormError>{error}</FormError>}

      {backend?.googleEnabled && (
        <>
          <GoogleButton busy={busy} onClick={() => void run(() => authActions.signInWithGoogle(next ?? '/'))} />
          <OrDivider />
        </>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {mode === 'signup' && (
          <Field label="Full name" error={shown.name}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                aria-invalid={!!shown.name || undefined}
              />
            )}
          </Field>
        )}
        <Field label="Email" error={shown.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!shown.email || undefined}
            />
          )}
        </Field>
        <Field
          label="Password"
          error={shown.password}
          hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters, with a number or symbol.` : undefined}
        >
          {(id) => (
            <PasswordInput
              id={id}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              invalid={!!shown.password}
            />
          )}
        </Field>
        {mode === 'signin' && (
          <Link
            to={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
            className="tap-target -mt-1 self-end rounded-md text-[13.5px] font-semibold text-muted hover:text-fg"
          >
            Forgot password?
          </Link>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-1 w-full"
          disabled={busy}
          iconRight={busy ? undefined : <Icon name="right" size={18} />}
        >
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {mode === 'signup' && (
        <p className="mt-4 text-center text-[12.5px] text-faint">
          Organizers: create your account, then ask the tournament owner to add you to the team.
        </p>
      )}

      {demo && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="demo-accounts">
          <h2 id="demo-accounts" className="eyebrow mb-1">
            Demo accounts
          </h2>
          <p className="mb-3 text-[13px] text-muted">
            This preview keeps accounts in your browser. Try a role (password{' '}
            <span className="num font-semibold text-fg">{DEMO_PASSWORD}</span>):
          </p>
          <div className="flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => void run(() => authActions.signIn(a.email, DEMO_PASSWORD))}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3.5 py-2 text-left transition-colors hover:border-fg/40"
              >
                <Icon name={a.role ? 'shield' : 'user'} size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{a.label}</span>
                  <span className="block truncate text-[12.5px] text-muted">{a.description}</span>
                </span>
                <Icon name="right" size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </section>
      )}
    </AuthLayout>
  );
}
