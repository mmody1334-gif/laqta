export type MarketId = 'amazon-eg' | 'amazon-ae' | 'noon-eg' | 'noon-ae';
export type Store = 'amazon' | 'noon';
export type DealType = 'pricing_error' | 'real' | 'fake';
export type SellerType = 'store' | 'fulfilled_by_store' | 'third_party' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export interface DealItem {
  id: number;
  productId: number;
  refPrice: number;
  newPrice: number;
  dropPct: number;
  dealType: DealType;
  confidence: Confidence;
  sellerName?: string;
  sellerType: SellerType;
  reasons: string[];
  confirmed: boolean;
  notified: boolean;
  detectedAt: string;
  title: string;
  url: string;
  image?: string;
  store: Store;
  market: MarketId;
  externalId: string;
}

export interface SystemStats {
  pagesCrawled: number;
  productsSeen: number;
  dealsFound: number;
  pricingErrorsFound: number;
  lastCrawlTime: string | null;
  isRunning: boolean;
  dbTotalDeals: number;
  dbPricingErrors: number;
  dbProductsCount: number;
}
