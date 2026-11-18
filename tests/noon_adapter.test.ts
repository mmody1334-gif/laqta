import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoonAdapter } from '../src/adapters/noon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('NoonAdapter (Real Fixtures Verification)', () => {
  const adapter = new NoonAdapter();

  it('parses at least 20 products from category fixture with valid prices and SKUs', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/noon-eg/category_electronics_asc.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');

    const products = adapter.parseListingHtml(html, 'noon-eg');
    expect(products.length).toBeGreaterThanOrEqual(20);

    for (const p of products.slice(0, 10)) {
      expect(p.externalId).toMatch(/^[A-Z0-9]+$/);
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.price).toBeGreaterThan(0);
      expect(p.currency).toBe('EGP');
      expect(p.url).toContain('/p/');
    }
  });

  it('parses products from search fixture in ascending price order', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/noon-eg/search_sandisk_asc.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');

    const products = adapter.parseListingHtml(html, 'noon-eg');
    expect(products.length).toBeGreaterThan(0);

    // Verify prices are positive
    for (const p of products) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.currency).toBe('EGP');
    }
  });
});
