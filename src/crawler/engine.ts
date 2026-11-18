import { EventEmitter } from 'node:events';
import { AppDatabase } from '../db/index.js';
import { NoonAdapter } from '../adapters/noon.js';
import { AmazonAdapter } from '../adapters/amazon.js';
import { detectDeal } from '../core/detector.js';
import type { CrawlTarget, Deal, MarketId, ProductSnapshot } from '../core/types.js';

export interface CrawlerStats {
  pagesCrawled: number;
  productsSeen: number;
  dealsFound: number;
  pricingErrorsFound: number;
  lastCrawlTime: string | null;
  isRunning: boolean;
}

export class CrawlerEngine extends EventEmitter {
  private db: AppDatabase;
  private noonAdapter: NoonAdapter;
  private amazonAdapter: AmazonAdapter;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private stats: CrawlerStats = {
    pagesCrawled: 0,
    productsSeen: 0,
    dealsFound: 0,
    pricingErrorsFound: 0,
    lastCrawlTime: null,
    isRunning: false
  };

  constructor(db: AppDatabase) {
    super();
    this.db = db;
    this.noonAdapter = new NoonAdapter();
    this.amazonAdapter = new AmazonAdapter();
  }

  public getStats(): CrawlerStats {
    return { ...this.stats };
  }

  public async scanTarget(target: CrawlTarget): Promise<{ products: ProductSnapshot[]; deals: Deal[] }> {
    const adapter = target.store === 'noon' ? this.noonAdapter : this.amazonAdapter;
    const foundDeals: Deal[] = [];

    try {
      const snapshots = await adapter.listProducts(target);
      this.stats.pagesCrawled++;
      this.stats.productsSeen += snapshots.length;
      this.stats.lastCrawlTime = new Date().toISOString();

      // Process each snapshot through DB and Detector
      for (const snapshot of snapshots) {
        const product = this.db.upsertProduct(target.store, target.market, snapshot);
        const history = this.db.getPriceHistory(product.id, 20);
        const previousDeal = this.db.getLatestDeal(product.id);

        const detection = detectDeal(snapshot, history, {
          peerCandidates: snapshots,
          previousDeal
        });

        // Record price history
        this.db.recordPrice(product.id, snapshot);

        if (detection.isDeal && detection.deal && detection.shouldAlert) {
          const dealRecord = this.db.insertDeal({
            ...detection.deal,
            productId: product.id
          });

          this.stats.dealsFound++;
          if (dealRecord.dealType === 'pricing_error') {
            this.stats.pricingErrorsFound++;
          }

          foundDeals.push(dealRecord);
          // Broadcast live deal event
          this.emit('deal', { deal: dealRecord, product, snapshot });
        }
      }

      // Update crawl target state
      const nextRun = new Date(Date.now() + target.intervalMin * 60 * 1000).toISOString();
      this.db.updateCrawlTargetResult(
        target.id!,
        foundDeals.length,
        'success',
        foundDeals.length === 0,
        nextRun,
        target.intervalMin,
        foundDeals.length > 0 ? target.priority + 2 : target.priority
      );

      return { products: snapshots, deals: foundDeals };
    } catch (err: any) {
      console.error(`[CRAWLER] Target failed (${target.market} - ${target.value}):`, err.message);
      return { products: [], deals: [] };
    }
  }

  public async runInstantScan(marketId?: MarketId): Promise<{ scannedTargets: number; newDeals: number }> {
    const targets = this.db.getNextCrawlTargets(5);
    const filtered = marketId ? targets.filter((t) => t.market === marketId) : targets;

    let dealsCount = 0;
    for (const target of filtered) {
      const res = await this.scanTarget(target);
      dealsCount += res.deals.length;
    }

    return { scannedTargets: filtered.length, newDeals: dealsCount };
  }

  public start(intervalMs = 30000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stats.isRunning = true;
    console.log(`[CRAWLER] Engine started. Scanning loop interval: ${intervalMs}ms`);

    this.timer = setInterval(async () => {
      try {
        const targets = this.db.getNextCrawlTargets(2);
        for (const target of targets) {
          await this.scanTarget(target);
        }
      } catch (err: any) {
        console.error('[CRAWLER] Loop error:', err.message);
      }
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.stats.isRunning = false;
  }
}
