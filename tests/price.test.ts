import { describe, it, expect } from 'vitest';
import { parsePrice, normalizeDigits } from '../src/core/price.js';

describe('Price Parser (Section 13-A)', () => {
  it('normalizes Arabic digits and separators', () => {
    expect(normalizeDigits('٣٧٥٫٠٠')).toBe('375.00');
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
  });

  it('parses "2.00 جنيه" to 2', () => {
    expect(parsePrice('2.00 جنيه')).toBe(2);
  });

  it('parses "EGP 1,299.00" to 1299', () => {
    expect(parsePrice('EGP 1,299.00')).toBe(1299);
  });

  it('parses "٣٧٥٫٠٠ جنيه" to 375', () => {
    expect(parsePrice('٣٧٥٫٠٠ جنيه')).toBe(375);
  });

  it('parses "AED 2,049" to 2049', () => {
    expect(parsePrice('AED 2,049')).toBe(2049);
  });

  it('parses "د.إ.‏ 49.95" to 49.95', () => {
    expect(parsePrice('د.إ.‏ 49.95')).toBe(49.95);
  });

  it('parses split whole="2" and fraction="00" to 2', () => {
    expect(parsePrice({ whole: '2', fraction: '00' })).toBe(2);
  });

  it('parses split whole="1,299" and fraction="50" to 1299.5', () => {
    expect(parsePrice({ whole: '1,299', fraction: '50' })).toBe(1299.5);
  });

  it('returns null for empty string and unavailable indicators', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('   ')).toBeNull();
    expect(parsePrice('غير متوفر')).toBeNull();
    expect(parsePrice('نفذت الكمية')).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });

  it('returns null for non-positive or 0 prices', () => {
    expect(parsePrice('0.00 EGP')).toBeNull();
    expect(parsePrice('0 جنيه')).toBeNull();
  });
});
