/**
 * Normalizes Arabic and Persian digits to standard ASCII 0-9 digits,
 * and normalizes Arabic decimal separator (٫ U+066B) to standard dot.
 */
export function normalizeDigits(input: string): string {
  if (!input) return '';

  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  let result = input;

  for (let i = 0; i < 10; i++) {
    result = result.replaceAll(arabicDigits[i], String(i));
    result = result.replaceAll(persianDigits[i], String(i));
  }

  // Arabic decimal separator (U+066B) -> '.'
  result = result.replaceAll('\u066B', '.');
  // Arabic thousands separator (U+066C) -> ','
  result = result.replaceAll('\u066C', ',');

  return result;
}

export interface SplitPriceInput {
  whole?: string | null;
  fraction?: string | null;
}

/**
 * Parses a price string or a split whole/fraction object into a positive float number.
 * Returns null if the price cannot be reliably extracted or is non-positive.
 */
export function parsePrice(
  input: string | SplitPriceInput | null | undefined
): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  // Handle { whole, fraction } object
  if (typeof input === 'object') {
    const rawWhole = input.whole?.trim();
    if (!rawWhole) return null;

    const normalizedWhole = normalizeDigits(rawWhole).replace(/,/g, '').trim();
    const cleanWhole = normalizedWhole.replace(/[^\d]/g, '');
    if (!cleanWhole) return null;

    const rawFraction = input.fraction ? normalizeDigits(input.fraction).replace(/[^\d]/g, '') : '';
    const fractionPart = rawFraction ? `.${rawFraction}` : '';

    const parsed = parseFloat(`${cleanWhole}${fractionPart}`);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Quick exclusion for obvious unavailable markers
  if (
    /غير متوفر|نفذت الكمية|غير متاح|out of stock|currently unavailable/i.test(str)
  ) {
    return null;
  }

  const normalized = normalizeDigits(str);

  // Extract price number patterns:
  // e.g. "1,299.00", "2.00", "2,049", "49.95", "375.00"
  // Handles commas as thousands separator or decimal separator when appropriate.
  const match = normalized.match(/(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const cleanNumStr = match[0].replace(/,/g, '');
  const val = parseFloat(cleanNumStr);

  if (isNaN(val) || val <= 0) {
    return null;
  }

  return Math.round(val * 100) / 100;
}
