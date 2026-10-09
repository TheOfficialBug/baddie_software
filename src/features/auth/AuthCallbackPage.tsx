import { Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { useAuth } from '@/auth/authStore';
import { homeFor, safeNext } from '@/auth/redirects';
import { useAccess } from '@/auth/useAccess';

import { ButtonLink } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/PageLoading';

import { AuthLayout } from '@/features/auth/AuthLayout';

/**
 * Where Google and email links (sign-up confirmation) land. The Supabase client exchanges the
 * one-time code in the URL for a session; once signed in we continue to `next`.
 */
export function AuthCallbackPage() {
  useDocumentTitle('Signing in');
  const [params] = useSearchParams();
  const status = useAuth((s) => s.status);
  const recovering = useAuth((s) => s.recovering);
  const { isOrganizer } = useAccess();
  const failure = params.get('error_description') ?? params.get('error');

  if (failure) {
    return (
      <AuthLayout title="That link didn't work" subtitle={failure.replace(/\+/g, ' ')}>
        <ButtonLink to="/login" variant="primary" size="lg" className="w-full">
          Back to sign in
        </ButtonLink>
      </AuthLayout>
    );
  }
  if (status === 'loading') return <PageLoading />;
  if (recovering) return <Navigate to="/reset-password" replace />;
  if (status === 'signedIn') return <Navigate to={safeNext(params.get('next')) ?? homeFor(isOrganizer)} replace />;
  return (
    <AuthLayout title="Email confirmed" subtitle="Sign in to continue. (Links only sign you in on the device you created the account on.)">
      <ButtonLink to="/login" variant="primary" size="lg" className="w-full">
        Sign in
      </ButtonLink>
    </AuthLayout>
  );
}
