const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function time(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** ISO → `EEE, MMM d · h:mm a` (e.g. `Thu, Sep 10 · 7:30 PM`). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${time(d)}`;
}

/** ISO → `mediumDate` (e.g. `Jan 15, 2027`). */
export function formatMediumDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** ISO → `medium` (e.g. `Jan 15, 2027, 7:30:00 PM`). */
export function formatMedium(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
}

/** IDR currency like Angular's `currency: 'IDR' : 'symbol' : '1.0-0' : 'id'`. */
export function formatPrice(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}
