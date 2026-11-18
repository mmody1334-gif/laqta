import { describe, it, expect } from 'vitest';
import { detectDeal } from '../src/core/detector.js';
import type { ProductSnapshot, PriceHistoryEntry, Deal } from '../src/core/types.js';

function createSnapshot(overrides: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    externalId: 'TEST12345',
    title: 'SanDisk iXpand 64GB Flash Drive',
    url: 'https://www.amazon.eg/dp/TEST12345',
    price: 375,
    currency: 'EGP',
    inStock: true,
    seller: 'Amazon.eg',
    sellerType: 'store',
    ...overrides
  };
}

function createHistory(prices: number[], hoursInterval = 24): PriceHistoryEntry[] {
  return prices.map((price, idx) => ({
    productId: 1,
    price,
    currency: 'EGP',
    inStock: true,
    sellerType: 'store',
    capturedAt: new Date(Date.now() - (prices.length - idx) * hoursInterval * 3600 * 1000).toISOString()
  }));
}

describe('Detector Algorithm (Section 13-B)', () => {
  it('detects 99% drop as pricing_error for history [375, 375, 380] then 2', () => {
    const history = createHistory([375, 375, 380]);
    const snapshot = createSnapshot({ price: 2 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.deal?.dealType).toBe('pricing_error');
    expect(result.deal?.dropPct).toBe(99);
    expect(result.deal?.confidence).toBe('high');
    expect(result.method).toBe('history');
  });

  it('detects 63% drop as real discount for history [40, 40] then 15 (minRefPrice = 0)', () => {
    const history = createHistory([40, 40]);
    const snapshot = createSnapshot({ price: 15 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.deal?.dealType).toBe('real');
    expect(result.deal?.dropPct).toBe(63);
    expect(result.deal?.confidence).toBe('high');
  });

  it('ignores drop below 50%: history [1000, 1000] then 520 (48% drop)', () => {
    const history = createHistory([1000, 1000]);
    const snapshot = createSnapshot({ price: 520 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(false);
    expect(result.shouldAlert).toBe(false);
  });

  it('detects exact 50% drop: history [1000, 1000] then 500 as real discount', () => {
    const history = createHistory([1000, 1000]);
    const snapshot = createSnapshot({ price: 500 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.deal?.dropPct).toBe(50);
    expect(result.deal?.dealType).toBe('real');
  });

  it('detects 98% drop on new product with listPrice=5000 and price=100 as pricing_error', () => {
    const snapshot = createSnapshot({ price: 100, listPrice: 5000 });
    const result = detectDeal(snapshot, []);

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.deal?.dealType).toBe('pricing_error');
    expect(result.deal?.dropPct).toBe(98);
    expect(result.deal?.confidence).toBe('medium');
    expect(result.method).toBe('page_list_price');
  });

  it('detects 55% drop on new product with listPrice=200 and price=90 as real discount', () => {
    const snapshot = createSnapshot({ price: 90, listPrice: 200 });
    const result = detectDeal(snapshot, []);

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.deal?.dealType).toBe('real');
    expect(result.deal?.dropPct).toBe(55);
    expect(result.deal?.confidence).toBe('medium');
  });

  it('detects 99% peerDrop on new product with no listPrice and no history via similar peers', () => {
    const target = createSnapshot({
      externalId: 'TARGET01',
      title: 'SanDisk iXpand 64GB Flash Drive OTG',
      price: 2,
      listPrice: undefined
    });

    const peers: ProductSnapshot[] = [
      createSnapshot({ externalId: 'P1', title: 'SanDisk iXpand 64GB Flash Drive OTG Type-C', price: 360 }),
      createSnapshot({ externalId: 'P2', title: 'SanDisk iXpand 64GB Flash Drive USB 3.0', price: 380 }),
      createSnapshot({ externalId: 'P3', title: 'SanDisk iXpand 64GB Flash Drive Apple iPhone', price: 390 }),
      createSnapshot({ externalId: 'P4', title: 'SanDisk iXpand 64GB Flash Drive for Phone', price: 400 })
    ];

    const result = detectDeal(target, [], { peerCandidates: peers });

    expect(result.isDeal).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.method).toBe('peers');
    expect(result.deal?.dropPct).toBeGreaterThanOrEqual(99);
    expect(result.deal?.dealType).toBe('pricing_error');
  });

  it('rejects dissimilar peer comparison: USB cable at 10 vs Laptop at 20000', () => {
    const target = createSnapshot({
      title: 'كابل شحن USB Type-C سريع',
      price: 10
    });

    const peers: ProductSnapshot[] = [
      createSnapshot({
        title: 'لابتوب Dell Core i7 16GB RAM 512GB SSD',
        price: 20000
      })
    ];

    const result = detectDeal(target, [], { peerCandidates: peers });
    expect(result.isDeal).toBe(false);
  });

  it('rejects out of stock or price <= 0 products', () => {
    const oos = createSnapshot({ inStock: false, price: 10 });
    expect(detectDeal(oos, []).isDeal).toBe(false);

    const zeroPrice = createSnapshot({ price: 0 });
    expect(detectDeal(zeroPrice, []).isDeal).toBe(false);
  });

  it('classifies fake discount when current price matches historical median despite advertised list price', () => {
    const history = createHistory([300, 300, 300]);
    const snapshot = createSnapshot({ price: 300, listPrice: 900 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(true);
    expect(result.deal?.dealType).toBe('fake');
    expect(result.shouldAlert).toBe(false);
  });

  it('suppresses duplicate alert unless drop increases by >= 10 points or price recovers', () => {
    const history = createHistory([100, 100]);
    const snapshot = createSnapshot({ price: 45 }); // 55% drop

    const firstResult = detectDeal(snapshot, history);
    expect(firstResult.shouldAlert).toBe(true);

    const prevDeal: Deal = {
      productId: 1,
      refPrice: 100,
      newPrice: 45,
      dropPct: 55,
      dealType: 'real',
      confidence: 'high',
      sellerType: 'store',
      reasonsJson: '[]',
      confirmed: true,
      notified: true,
      detectedAt: new Date().toISOString()
    };

    // Same deal repeated (still 55%) -> no new alert
    const repeatResult = detectDeal(snapshot, history, { previousDeal: prevDeal });
    expect(repeatResult.shouldAlert).toBe(false);

    // Price drops further to 30 (70% drop, +15 points) -> new alert!
    const deeperDropSnapshot = createSnapshot({ price: 30 });
    const deeperResult = detectDeal(deeperDropSnapshot, history, { previousDeal: prevDeal });
    expect(deeperResult.shouldAlert).toBe(true);
    expect(deeperResult.deal?.dropPct).toBe(70);
  });

  it('classifies pricing_error when price dropped >= 60% in less than 6 hours', () => {
    // 2 hours ago was 100, now 35 (65% drop in 2 hours)
    const history = createHistory([100, 100], 2);
    const snapshot = createSnapshot({ price: 35 });
    const result = detectDeal(snapshot, history);

    expect(result.isDeal).toBe(true);
    expect(result.deal?.dealType).toBe('pricing_error');
    expect(result.deal?.dropPct).toBe(65);
  });
});
