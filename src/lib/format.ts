export const DAY = 86400000;

export function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (start === end) return `${mo(s)} ${s.getDate()}, ${s.getFullYear()}`;
  if (s.getMonth() === e.getMonth()) return `${mo(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  return `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', opts);
}

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function minutesSince(ms: number, now = Date.now()) {
  return Math.max(0, Math.floor((now - ms) / 60000));
}

export function fmtElapsed(ms: number, now = Date.now()) {
  const m = minutesSince(ms, now);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtAgo(ms: number, now = Date.now()) {
  const m = minutesSince(ms, now);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const money = (n: number) => (n === 0 ? 'Free' : `$${n.toFixed(n % 1 ? 2 : 0)}`);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
