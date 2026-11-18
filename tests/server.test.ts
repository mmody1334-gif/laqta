import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server/api.js';

describe('Server API Endpoints', () => {
  let app: any;
  let db: any;

  beforeAll(async () => {
    const server = buildServer(':memory:');
    app = server.app;
    db = server.db;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('GET /api/stats returns stats object', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/stats'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data).toHaveProperty('dbTotalDeals');
    expect(data).toHaveProperty('dbPricingErrors');
    expect(data).toHaveProperty('pagesCrawled');
  });

  it('GET /api/deals returns deals list and filters properly', async () => {
    // Insert test product & deal
    const product = db.upsertProduct('noon', 'noon-eg', {
      externalId: 'SKU9999',
      title: 'فلاشة سانديسك 128 جيجا فخمة',
      url: 'https://www.noon.com/egypt-ar/p-12345/SKU9999/p/',
      price: 2,
      currency: 'EGP',
      inStock: true,
      sellerType: 'store'
    });

    db.insertDeal({
      productId: product.id,
      refPrice: 380,
      newPrice: 2,
      dropPct: 99,
      dealType: 'pricing_error',
      confidence: 'high',
      sellerName: 'Noon',
      sellerType: 'store',
      reasonsJson: '["نزول حاد 99%"]',
      confirmed: true,
      notified: false,
      detectedAt: new Date().toISOString()
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/deals?minDrop=50'
    });

    expect(response.statusCode).toBe(200);
    const deals = JSON.parse(response.payload);
    expect(deals.length).toBeGreaterThanOrEqual(1);
    expect(deals[0].externalId).toBe('SKU9999');
    expect(deals[0].dropPct).toBe(99);
    expect(deals[0].sellerType).toBe('store');
  });
});
