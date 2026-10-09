/**
 * Single place where runtime errors are reported. Today this logs to the console;
 * to send errors to a service (Sentry, Logtail, …) initialise it in `initMonitoring`
 * and forward from `reportError`.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[smashboard]', error, context ?? '');
}

let installed = false;

/** Catch errors that escape React (event handlers, timers, rejected promises). */
export function initMonitoring(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, { source: 'window.error' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'unhandledrejection' }));
}

/** True for the error a browser throws when a lazily loaded chunk is gone (usually after a new deploy). */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    msg,
  );
}
