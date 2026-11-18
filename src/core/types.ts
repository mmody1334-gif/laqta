export type Store = 'amazon' | 'noon';

export type MarketId = 'amazon-eg' | 'amazon-ae' | 'noon-eg' | 'noon-ae';

export type Currency = 'EGP' | 'AED';

export type SellerType = 'store' | 'fulfilled_by_store' | 'third_party' | 'unknown';

export type DealType = 'pricing_error' | 'real' | 'fake';

export type Confidence = 'high' | 'medium' | 'low';

export type CrawlTargetKind = 'category' | 'keyword' | 'deals' | 'watch';

export type CrawlMode = 'price-asc' | 'newest' | 'discount';

export interface ProductSnapshot {
  externalId: string;
  title: string;
  url: string;
  image?: string;
  price: number;
  listPrice?: number;
  currency: Currency;
  inStock: boolean;
  seller?: string;
  sellerType?: SellerType;
  fulfilledByStore?: boolean;
  category?: string;
}

export interface ProductRecord {
  id: number;
  store: Store;
  market: MarketId;
  externalId: string;
  title: string;
  url: string;
  image?: string;
  category?: string;
  firstSeen: string;
}

export interface PriceHistoryEntry {
  id?: number;
  productId: number;
  price: number;
  listPrice?: number | null;
  currency: Currency;
  inStock: boolean;
  seller?: string | null;
  sellerType: SellerType;
  capturedAt: string;
}

export interface Deal {
  id?: number;
  productId: number;
  refPrice: number;
  newPrice: number;
  dropPct: number;
  dealType: DealType;
  confidence: Confidence;
  sellerName?: string | null;
  sellerType: SellerType;
  reasonsJson: string;
  confirmed: boolean;
  notified: boolean;
  detectedAt: string;
}

export interface CrawlTarget {
  id?: number;
  store: Store;
  market: MarketId;
  kind: CrawlTargetKind;
  value: string;
  mode: CrawlMode;
  priority: number;
  nextRunAt: string;
  intervalMin: number;
  hitsCount: number;
  lastRun?: string | null;
  lastStatus?: string | null;
  unchangedRuns: number;
  failCount: number;
  pausedUntil?: string | null;
}

export interface CategoryStats {
  categoryId: string;
  medianPrice: number;
  p10Price: number;
  sampleSize: number;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  url: string;
  parentId?: string;
  market: MarketId;
  store: Store;
  level?: number;
}

export interface MarketConfig {
  id: MarketId;
  store: Store;
  country: 'eg' | 'ae';
  name: string;
  flag: string;
  currency: Currency;
  domain: string;
  baseUrl: string;
  locale: string;
  sortParams: Record<string, string>;
  minPriceFilterParam?: string;
  dealsPath?: string;
}
