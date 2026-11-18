import type { Page } from 'playwright';
import type { StoreAdapter } from './base.js';
import type {
  CrawlTarget,
  ProductSnapshot,
  Category,
  MarketId
} from '../core/types.js';

/**
 * Amazon Store Adapter
 * Postponed pending official Amazon Creators API access.
 * Interface stubbed to allow plug-and-play integration once credentials are provided.
 */
export class AmazonAdapter implements StoreAdapter {
  public store = 'amazon' as const;

  public async listProducts(
    target: CrawlTarget,
    _htmlOrJson?: string
  ): Promise<ProductSnapshot[]> {
    throw new Error(
      `Amazon scraping is postponed pending Creators API. Cannot process target: ${target.value}`
    );
  }

  public async discoverCategories(_market: MarketId): Promise<Category[]> {
    throw new Error('Amazon category discovery postponed pending Creators API.');
  }

  public async fetchProduct(
    _url: string,
    _market: MarketId,
    _page?: Page
  ): Promise<ProductSnapshot> {
    throw new Error('Amazon product fetch postponed pending Creators API.');
  }
}
