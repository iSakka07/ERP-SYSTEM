/** Display separators never enter financial calculations or submitted values. */
export function currencyRaw(value: string | number): string {
  return String(value).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[٬,\s]/g, "").replace(/٫/g, ".");
}
export function currencyDisplay(value: string | number, fixed = true): string {
  const raw = currencyRaw(value);
  if (!raw) return "";
  if (!/^\d*(\.\d{0,2})?$/.test(raw)) return raw;
  const [integer, decimal] = raw.split(".");
  const grouped = (integer || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return grouped + (fixed ? "." + (decimal || "").padEnd(2, "0") : decimal !== undefined ? "." + decimal : "");
}
