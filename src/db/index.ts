import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ProductSnapshot,
  ProductRecord,
  PriceHistoryEntry,
  Deal,
  CrawlTarget,
  CategoryStats,
  Store,
  MarketId
} from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AppDatabase {
  public db: DatabaseType;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schemaSql);
  }

  public upsertProduct(
    store: Store,
    market: MarketId,
    snapshot: ProductSnapshot
  ): ProductRecord {
    const existing = this.db
      .prepare<[string, string, string], ProductRecord>(
        `SELECT id, store, market, external_id as externalId, title, url, image, category, first_seen as firstSeen
         FROM products WHERE store = ? AND market = ? AND external_id = ?`
      )
      .get(store, market, snapshot.externalId);

    if (existing) {
      this.db
        .prepare(
          `UPDATE products SET title = ?, url = ?, image = COALESCE(?, image), category = COALESCE(?, category)
           WHERE id = ?`
        )
        .run(snapshot.title, snapshot.url, snapshot.image ?? null, snapshot.category ?? null, existing.id);
      return {
        ...existing,
        title: snapshot.title,
        url: snapshot.url,
        image: snapshot.image ?? existing.image,
        category: snapshot.category ?? existing.category
      };
    }

    const info = this.db
      .prepare(
        `INSERT INTO products (store, market, external_id, title, url, image, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        store,
        market,
        snapshot.externalId,
        snapshot.title,
        snapshot.url,
        snapshot.image ?? null,
        snapshot.category ?? null
      );

    return {
      id: Number(info.lastInsertRowid),
      store,
      market,
      externalId: snapshot.externalId,
      title: snapshot.title,
      url: snapshot.url,
      image: snapshot.image,
      category: snapshot.category,
      firstSeen: new Date().toISOString()
    };
  }

  public recordPrice(productId: number, snapshot: ProductSnapshot): PriceHistoryEntry {
    const sellerType = snapshot.sellerType ?? (snapshot.fulfilledByStore ? 'fulfilled_by_store' : 'unknown');
    const capturedAt = new Date().toISOString();

    const info = this.db
      .prepare(
        `INSERT INTO price_history (product_id, price, list_price, currency, in_stock, seller, seller_type, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        productId,
        snapshot.price,
        snapshot.listPrice ?? null,
        snapshot.currency,
        snapshot.inStock ? 1 : 0,
        snapshot.seller ?? null,
        sellerType,
        capturedAt
      );

    return {
      id: Number(info.lastInsertRowid),
      productId,
      price: snapshot.price,
      listPrice: snapshot.listPrice,
      currency: snapshot.currency,
      inStock: snapshot.inStock,
      seller: snapshot.seller,
      sellerType,
      capturedAt
    };
  }

  public getPriceHistory(productId: number, limit = 50, sinceDays?: number): PriceHistoryEntry[] {
    let query = `
      SELECT id, product_id as productId, price, list_price as listPrice,
             currency, in_stock as inStock, seller, seller_type as sellerType,
             captured_at as capturedAt
      FROM price_history
      WHERE product_id = ?
    `;
    const params: (number | string)[] = [productId];

    if (sinceDays && sinceDays > 0) {
      query += ` AND captured_at >= datetime('now', '-' || ? || ' days')`;
      params.push(sinceDays);
    }

    query += ` ORDER BY captured_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as unknown as PriceHistoryEntry[];
    return rows.map(r => ({
      ...r,
      inStock: Boolean(r.inStock)
    }));
  }

  public insertDeal(deal: Omit<Deal, 'id'>): Deal {
    const info = this.db
      .prepare(
        `INSERT INTO deals (product_id, ref_price, new_price, drop_pct, deal_type, confidence, seller_name, seller_type, reasons_json, confirmed, notified, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        deal.productId,
        deal.refPrice,
        deal.newPrice,
        deal.dropPct,
        deal.dealType,
        deal.confidence,
        deal.sellerName ?? null,
        deal.sellerType,
        deal.reasonsJson,
        deal.confirmed ? 1 : 0,
        deal.notified ? 1 : 0,
        deal.detectedAt || new Date().toISOString()
      );

    return {
      ...deal,
      id: Number(info.lastInsertRowid)
    };
  }

  public updateDealConfirmed(dealId: number, confirmed: boolean): void {
    this.db.prepare(`UPDATE deals SET confirmed = ? WHERE id = ?`).run(confirmed ? 1 : 0, dealId);
  }

  public updateDealNotified(dealId: number, notified: boolean): void {
    this.db.prepare(`UPDATE deals SET notified = ? WHERE id = ?`).run(notified ? 1 : 0, dealId);
  }

  public getLatestDeal(productId: number): Deal | null {
    const row = this.db
      .prepare<[number], Record<string, unknown>>(
        `SELECT id, product_id as productId, ref_price as refPrice, new_price as newPrice,
                drop_pct as dropPct, deal_type as dealType, confidence,
                seller_name as sellerName, seller_type as sellerType,
                reasons_json as reasonsJson, confirmed, notified, detected_at as detectedAt
         FROM deals WHERE product_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(productId);

    if (!row) return null;
    return {
      id: Number(row.id),
      productId: Number(row.productId),
      refPrice: Number(row.refPrice),
      newPrice: Number(row.newPrice),
      dropPct: Number(row.dropPct),
      dealType: row.dealType as Deal['dealType'],
      confidence: row.confidence as Deal['confidence'],
      sellerName: (row.sellerName as string | null) ?? undefined,
      sellerType: row.sellerType as Deal['sellerType'],
      reasonsJson: String(row.reasonsJson),
      confirmed: Boolean(row.confirmed),
      notified: Boolean(row.notified),
      detectedAt: String(row.detectedAt)
    };
  }

  public upsertCrawlTarget(target: CrawlTarget): CrawlTarget {
    const existing = this.db
      .prepare<[string, string, string, string, string], CrawlTarget>(
        `SELECT id, store, market, kind, value, mode, priority, next_run_at as nextRunAt,
                interval_min as intervalMin, hits_count as hitsCount, last_run as lastRun,
                last_status as lastStatus, unchanged_runs as unchangedRuns, fail_count as failCount,
                paused_until as pausedUntil
         FROM crawl_targets
         WHERE store = ? AND market = ? AND kind = ? AND value = ? AND mode = ?`
      )
      .get(target.store, target.market, target.kind, target.value, target.mode);

    if (existing) {
      return existing;
    }

    const info = this.db
      .prepare(
        `INSERT INTO crawl_targets (store, market, kind, value, mode, priority, next_run_at, interval_min, hits_count, unchanged_runs, fail_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        target.store,
        target.market,
        target.kind,
        target.value,
        target.mode,
        target.priority,
        target.nextRunAt,
        target.intervalMin,
        target.hitsCount ?? 0,
        target.unchangedRuns ?? 0,
        target.failCount ?? 0
      );

    return {
      ...target,
      id: Number(info.lastInsertRowid)
    };
  }

  public getNextCrawlTargets(limit = 10): CrawlTarget[] {
    const now = new Date().toISOString();
    return this.db
      .prepare<[string, string, number], CrawlTarget>(
        `SELECT id, store, market, kind, value, mode, priority, next_run_at as nextRunAt,
                interval_min as intervalMin, hits_count as hitsCount, last_run as lastRun,
                last_status as lastStatus, unchanged_runs as unchangedRuns, fail_count as failCount,
                paused_until as pausedUntil
         FROM crawl_targets
         WHERE next_run_at <= ? AND (paused_until IS NULL OR paused_until <= ?)
         ORDER BY priority DESC, next_run_at ASC
         LIMIT ?`
      )
      .all(now, now, limit);
  }

  public updateCrawlTargetResult(
    id: number,
    hitsCount: number,
    status: string,
    isUnchanged: boolean,
    nextRunAt: string,
    intervalMin: number,
    newPriority: number,
    pausedUntil?: string | null
  ): void {
    const now = new Date().toISOString();
    if (isUnchanged) {
      this.db
        .prepare(
          `UPDATE crawl_targets
           SET last_run = ?, last_status = ?, hits_count = hits_count + ?,
               unchanged_runs = unchanged_runs + 1, next_run_at = ?, interval_min = ?,
               priority = ?, paused_until = ?
           WHERE id = ?`
        )
        .run(now, status, hitsCount, nextRunAt, intervalMin, newPriority, pausedUntil ?? null, id);
    } else {
      this.db
        .prepare(
          `UPDATE crawl_targets
           SET last_run = ?, last_status = ?, hits_count = hits_count + ?,
               unchanged_runs = 0, next_run_at = ?, interval_min = ?,
               priority = ?, paused_until = ?
           WHERE id = ?`
        )
        .run(now, status, hitsCount, nextRunAt, intervalMin, newPriority, pausedUntil ?? null, id);
    }
  }

  public getCategoryStats(categoryId: string): CategoryStats | null {
    const row = this.db
      .prepare<[string], CategoryStats>(
        `SELECT category_id as categoryId, median_price as medianPrice,
                p10_price as p10Price, sample_size as sampleSize, updated_at as updatedAt
         FROM category_stats WHERE category_id = ?`
      )
      .get(categoryId);
    return row ?? null;
  }

  public upsertCategoryStats(stats: CategoryStats): void {
    this.db
      .prepare(
        `INSERT INTO category_stats (category_id, median_price, p10_price, sample_size, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(category_id) DO UPDATE SET
           median_price = excluded.median_price,
           p10_price = excluded.p10_price,
           sample_size = excluded.sample_size,
           updated_at = excluded.updated_at`
      )
      .run(stats.categoryId, stats.medianPrice, stats.p10Price, stats.sampleSize, stats.updatedAt);
  }

  public cleanupOldHistory(days = 60): number {
    const info = this.db
      .prepare(`DELETE FROM price_history WHERE captured_at < datetime('now', '-' || ? || ' days')`)
      .run(days);
    return info.changes;
  }

  public close(): void {
    this.db.close();
  }
}
