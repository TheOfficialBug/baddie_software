// Apply the saved theme before first paint (no flash of the wrong theme).
// "system" leaves the attribute unset so CSS follows prefers-color-scheme.
// The key must match STORAGE_KEYS.theme in src/config/app.ts.
try {
  var t = localStorage.getItem('smashboard.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  /* storage unavailable: follow the system theme */
}
