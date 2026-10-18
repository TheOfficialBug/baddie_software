/** Product name shown in the UI, page titles and printouts. */
export const APP_NAME = 'Smashboard';

/**
 * Keys for values kept in the browser. Bump a key's version suffix (or the store's
 * `version`) instead of reusing a key with a different shape.
 * Note: `theme` is also read by the inline script in public/theme-init.js.
 */
export const STORAGE_KEYS = {
  db: 'smashboard.db',
  theme: 'smashboard.theme',
  /** demo mode only: signed-in account id and locally created accounts */
  demoSession: 'smashboard.demo.session',
  adminSidebar: 'smashboard.adminSidebar',
  demoAccounts: 'smashboard.demo.accounts',
  /** live mode: changes not yet saved to the database, per account (session storage: survives a reload of the tab) */
  pending: 'smashboard.pending',
} as const;
