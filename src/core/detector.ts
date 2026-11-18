import type {
  ProductSnapshot,
  PriceHistoryEntry,
  Deal,
  Confidence,
  DealType,
  CategoryStats,
  SellerType
} from './types.js';
import { calculatePeerReferencePrice } from './peers.js';

export interface DetectionOptions {
  minDropPct?: number;
  minRefPrice?: number;
  peerCandidates?: ProductSnapshot[];
  categoryStats?: CategoryStats | null;
  previousDeal?: Deal | null;
}

export interface DetectionResult {
  isDeal: boolean;
  deal: Omit<Deal, 'id'> | null;
  method: 'history' | 'page_list_price' | 'peers' | 'category_p10' | 'none';
  shouldAlert: boolean;
  reasons: string[];
}

export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectDeal(
  snapshot: ProductSnapshot,
  history: PriceHistoryEntry[] = [],
  options: DetectionOptions = {}
): DetectionResult {
  const minDropThreshold = options.minDropPct ?? 50;
  const minRefPrice = options.minRefPrice ?? 0;
  const reasons: string[] = [];

  // Out of stock or invalid price -> no deal
  if (!snapshot.inStock || !snapshot.price || snapshot.price <= 0) {
    return {
      isDeal: false,
      deal: null,
      method: 'none',
      shouldAlert: false,
      reasons: ['Product out of stock or invalid price']
    };
  }

  const currentPrice = snapshot.price;
  let historyDrop = 0;
  let historyRefPrice = 0;
  let pageDiscount = 0;
  let peerDrop = 0;
  let peerRefPrice = 0;
  let categoryDrop = 0;
  let categoryRefPrice = 0;

  // 1. History Analysis (needs >= 2 snapshots)
  const validHistoryPrices = history
    .filter(h => h.inStock && h.price > 0)
    .map(h => h.price);

  if (validHistoryPrices.length >= 2) {
    historyRefPrice = calculateMedian(validHistoryPrices);
    if (historyRefPrice > currentPrice && historyRefPrice >= minRefPrice) {
      historyDrop = (historyRefPrice - currentPrice) / historyRefPrice;
    }
  }

  // Check for fake discount:
  // If site claims discount from listPrice, but currentPrice is within 5% of historical median,
  // it's a fake discount (the product was never actually sold at listPrice).
  if (
    validHistoryPrices.length >= 2 &&
    snapshot.listPrice &&
    snapshot.listPrice > currentPrice
  ) {
    const historicalMedian = calculateMedian(validHistoryPrices);
    const diffFromHistoryMedian = Math.abs(currentPrice - historicalMedian) / historicalMedian;
    if (diffFromHistoryMedian < 0.05) {
      // Fake discount
      const calculatedDrop = Math.round(
        ((snapshot.listPrice - currentPrice) / snapshot.listPrice) * 100
      );
      const fakeDeal: Omit<Deal, 'id'> = {
        productId: 0,
        refPrice: snapshot.listPrice,
        newPrice: currentPrice,
        dropPct: calculatedDrop,
        dealType: 'fake',
        confidence: 'low',
        sellerName: snapshot.seller,
        sellerType: snapshot.sellerType ?? 'unknown',
        reasonsJson: JSON.stringify(['خصم وهمي: السعر الحالي مطابق لوسيط السعر التاريخي']),
        confirmed: false,
        notified: false,
        detectedAt: new Date().toISOString()
      };
      return {
        isDeal: true,
        deal: fakeDeal,
        method: 'page_list_price',
        shouldAlert: false,
        reasons: ['Fake discount: price is near historical median despite advertised list price']
      };
    }
  }

  // 2. Page List Price ("Was" price)
  if (snapshot.listPrice && snapshot.listPrice > currentPrice && snapshot.listPrice >= minRefPrice) {
    pageDiscount = (snapshot.listPrice - currentPrice) / snapshot.listPrice;
  }

  // 3. Similar Peer Products Analysis
  if (options.peerCandidates && options.peerCandidates.length > 0) {
    const peerRes = calculatePeerReferencePrice(snapshot, options.peerCandidates);
    if (peerRes.peerPrice && peerRes.peerPrice > currentPrice && peerRes.peerPrice >= minRefPrice) {
      peerRefPrice = peerRes.peerPrice;
      peerDrop = (peerRefPrice - currentPrice) / peerRefPrice;
    }
  }

  // 4. Category p10 fallback (low confidence, only if drop >= 90%)
  if (options.categoryStats && options.categoryStats.p10Price > currentPrice && options.categoryStats.p10Price >= minRefPrice) {
    const p10 = options.categoryStats.p10Price;
    const catDrop = (p10 - currentPrice) / p10;
    if (catDrop >= 0.90) {
      categoryRefPrice = p10;
      categoryDrop = catDrop;
    }
  }

  // Determine highest drop percentage and method
  let chosenMethod: 'history' | 'page_list_price' | 'peers' | 'category_p10' | 'none' = 'none';
  let bestDrop = 0;
  let refPrice = 0;

  if (historyDrop > bestDrop) {
    bestDrop = historyDrop;
    refPrice = historyRefPrice;
    chosenMethod = 'history';
  }

  if (pageDiscount > bestDrop) {
    bestDrop = pageDiscount;
    refPrice = snapshot.listPrice!;
    chosenMethod = 'page_list_price';
  }

  if (peerDrop > bestDrop) {
    bestDrop = peerDrop;
    refPrice = peerRefPrice;
    chosenMethod = 'peers';
  }

  if (categoryDrop > bestDrop) {
    bestDrop = categoryDrop;
    refPrice = categoryRefPrice;
    chosenMethod = 'category_p10';
  }

  const dropPct = Math.round(bestDrop * 100);

  if (dropPct < minDropThreshold || refPrice <= currentPrice) {
    return {
      isDeal: false,
      deal: null,
      method: chosenMethod,
      shouldAlert: false,
      reasons: [`Drop percentage ${dropPct}% is below threshold ${minDropThreshold}%`]
    };
  }

  // Fast drop check in last 6 hours
  let isFastDrop6h = false;
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const recentSnapshots = history.filter(
    h => new Date(h.capturedAt).getTime() >= sixHoursAgo && h.price > 0
  );
  if (recentSnapshots.length > 0) {
    const recentMax = Math.max(...recentSnapshots.map(h => h.price));
    if (recentMax > currentPrice && (recentMax - currentPrice) / recentMax >= 0.60) {
      isFastDrop6h = true;
      reasons.push('نزول سريع ≥ 60% في أقل من 6 ساعات');
    }
  }

  // Classify Deal Type: pricing_error vs real
  let dealType: DealType;

  const isExtremeLowPrice =
    (snapshot.currency === 'EGP' && currentPrice <= 5 && refPrice >= 10 * currentPrice) ||
    (snapshot.currency === 'AED' && currentPrice <= 1 && refPrice >= 10 * currentPrice);

  if (
    historyDrop >= 0.80 ||
    dropPct >= 90 ||
    isExtremeLowPrice ||
    isFastDrop6h
  ) {
    dealType = 'pricing_error';
    if (historyDrop >= 0.80) reasons.push('نزول حاد ≥ 80% عن تاريخ السعر المسجل');
    if (dropPct >= 90) reasons.push('نسبة خصم استثنائية ≥ 90%');
    if (isExtremeLowPrice) reasons.push('سعر متدنٍ جداً مع فارق يفوق 10 أضعاف');
  } else {
    dealType = 'real';
    reasons.push(`خصم حقيقي بنسبة ${dropPct}%`);
  }

  // Determine Confidence
  let confidence: Confidence = 'medium';
  if (chosenMethod === 'history') {
    confidence = 'high';
    reasons.push('تم التأكيد من تاريخ السعر للمنتج');
  } else if (chosenMethod === 'peers') {
    confidence = 'medium';
    reasons.push('مقارنةً بنفس المنتج من بائعين آخرين');
  } else if (chosenMethod === 'page_list_price') {
    confidence = 'medium';
    reasons.push('حسب سعر الموقع المعلن');
  } else if (chosenMethod === 'category_p10') {
    confidence = 'low';
    reasons.push('أرخص بكثير من متوسط القسم (مؤشر عام)');
  }

  // Seller resolution
  let sellerType: SellerType = snapshot.sellerType ?? 'unknown';
  if (snapshot.seller) {
    const sellerLower = snapshot.seller.toLowerCase();
    if (
      sellerLower.includes('amazon') ||
      sellerLower.includes('أمازون') ||
      sellerLower.includes('noon') ||
      sellerLower.includes('نون')
    ) {
      sellerType = 'store';
    } else if (snapshot.fulfilledByStore) {
      sellerType = 'fulfilled_by_store';
    }
  }

  const deal: Omit<Deal, 'id'> = {
    productId: 0,
    refPrice,
    newPrice: currentPrice,
    dropPct,
    dealType,
    confidence,
    sellerName: snapshot.seller,
    sellerType,
    reasonsJson: JSON.stringify(reasons),
    confirmed: false,
    notified: false,
    detectedAt: new Date().toISOString()
  };

  // Check duplicate alert rules
  let shouldAlert = true;
  if (options.previousDeal) {
    const prev = options.previousDeal;
    // Don't alert again unless dropPct increased by >= 10 points or price recovered and dropped again
    const dropIncreased10Pts = deal.dropPct >= prev.dropPct + 10;
    const priceRecoveredThenDropped = prev.newPrice < currentPrice && deal.dropPct >= minDropThreshold;

    if (!dropIncreased10Pts && !priceRecoveredThenDropped) {
      shouldAlert = false;
      reasons.push('تم إرسال تنبيه سابق ولم تزد النسبة 10 نقاط');
    }
  }

  return {
    isDeal: true,
    deal,
    method: chosenMethod,
    shouldAlert,
    reasons
  };
}
