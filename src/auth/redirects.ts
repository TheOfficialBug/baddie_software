// Where to send people after signing in. Only same-site paths are allowed, so a crafted
// link like /login?next=https://evil.example can't bounce someone off the site.

/** A safe in-app path from a `next` parameter, or null. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  let path: string;
  try {
    path = decodeURIComponent(next);
  } catch {
    return null;
  }
  // browsers drop tabs and newlines from URLs, so "/\t/evil.example" would become "//evil.example"
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\') || /^\/+[a-z]+:/i.test(path)) return null;
  if (/^\/(login|signup|forgot-password|reset-password|auth\/)/.test(path)) return null;
  return path;
}

/** "/login?next=…" for the current page. */
export const loginPath = (next?: string, mode?: 'signup') => {
  const q = new URLSearchParams();
  if (mode) q.set('mode', mode);
  if (next && safeNext(next)) q.set('next', next);
  const s = q.toString();
  return s ? `/login?${s}` : '/login';
};

/** Default landing page after sign-in: the organizer desk for staff, otherwise My matches. */
export const homeFor = (isOrganizer: boolean) => (isOrganizer ? '/admin' : '/me');
