import type { Page } from 'playwright';
import type {
  Store,
  MarketId,
  CrawlTarget,
  ProductSnapshot,
  Category
} from '../core/types.js';

export interface StoreAdapter {
  store: Store;
  listProducts(target: CrawlTarget, htmlOrJson?: string): Promise<ProductSnapshot[]>;
  discoverCategories(market: MarketId): Promise<Category[]>;
  fetchProduct(url: string, market: MarketId, page?: Page): Promise<ProductSnapshot>;
}
