export type CentsValue = number | string | { toString(): string };

/** Convert an exact database cents value at the application boundary. */
export function centsNumber(value: CentsValue): number {
  const result = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isSafeInteger(result)) {
    throw new Error("قيمة مالية غير صالحة أو أكبر من الحد الآمن للتطبيق.");
  }
  return result;
}

export function centsJson(value: CentsValue): number {
  return centsNumber(value);
}
