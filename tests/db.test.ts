import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../src/db/index.js';
import type { ProductSnapshot } from '../src/core/types.js';

describe('AppDatabase (SQLite)', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('upserts product and records price history', () => {
    const snapshot: ProductSnapshot = {
      externalId: 'B08XYZ123',
      title: 'فلاشة سانديسك 64 جيجا',
      url: 'https://www.amazon.eg/dp/B08XYZ123',
      price: 375,
      currency: 'EGP',
      inStock: true,
      seller: 'Amazon.eg',
      sellerType: 'store'
    };

    const product = db.upsertProduct('amazon', 'amazon-eg', snapshot);
    expect(product.id).toBeGreaterThan(0);
    expect(product.externalId).toBe('B08XYZ123');

    const historyEntry = db.recordPrice(product.id, snapshot);
    expect(historyEntry.id).toBeGreaterThan(0);
    expect(historyEntry.price).toBe(375);

    const history = db.getPriceHistory(product.id);
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(375);
    expect(history[0].sellerType).toBe('store');
  });

  it('inserts deal and updates confirmation and notification state', () => {
    const product = db.upsertProduct('amazon', 'amazon-eg', {
      externalId: 'B08XYZ123',
      title: 'فلاشة سانديسك 64 جيجا',
      url: 'https://www.amazon.eg/dp/B08XYZ123',
      price: 2,
      currency: 'EGP',
      inStock: true
    });

    const deal = db.insertDeal({
      productId: product.id,
      refPrice: 375,
      newPrice: 2,
      dropPct: 99,
      dealType: 'pricing_error',
      confidence: 'high',
      sellerName: 'Amazon.eg',
      sellerType: 'store',
      reasonsJson: '["نزول حاد"]',
      confirmed: false,
      notified: false,
      detectedAt: new Date().toISOString()
    });

    expect(deal.id).toBeDefined();

    db.updateDealConfirmed(deal.id!, true);
    db.updateDealNotified(deal.id!, true);

    const latest = db.getLatestDeal(product.id);
    expect(latest).not.toBeNull();
    expect(latest?.confirmed).toBe(true);
    expect(latest?.notified).toBe(true);
    expect(latest?.dropPct).toBe(99);
  });
});
