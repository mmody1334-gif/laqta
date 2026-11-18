import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppDatabase } from '../db/index.js';
import { CrawlerEngine } from '../crawler/engine.js';
import { PersistentBrowserManager } from '../browser/persistent.js';
import type { MarketId, DealType, SellerType } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildServer(dbPath?: string): { app: FastifyInstance; engine: CrawlerEngine; db: AppDatabase } {
  const app = Fastify({ logger: false });
  const finalDbPath = dbPath ?? path.resolve(__dirname, '../../data/laqta.db');

  fs.mkdirSync(path.dirname(finalDbPath), { recursive: true });
  const db = new AppDatabase(finalDbPath);
  const engine = new CrawlerEngine(db);

  // Setup default targets if empty
  const existingTargets = db.getNextCrawlTargets(10);
  if (existingTargets.length === 0) {
    const defaults = [
      { store: 'noon', market: 'noon-eg', kind: 'category', value: 'electronics-and-mobiles', mode: 'price-asc', priority: 20 },
      { store: 'noon', market: 'noon-eg', kind: 'keyword', value: 'sandisk', mode: 'price-asc', priority: 15 },
      { store: 'noon', market: 'noon-eg', kind: 'keyword', value: 'anker', mode: 'price-asc', priority: 15 },
      { store: 'noon', market: 'noon-ae', kind: 'category', value: 'electronics-and-mobiles', mode: 'price-asc', priority: 18 },
      { store: 'amazon', market: 'amazon-eg', kind: 'category', value: 'electronics', mode: 'price-asc', priority: 10 },
      { store: 'amazon', market: 'amazon-ae', kind: 'category', value: 'electronics', mode: 'price-asc', priority: 10 }
    ] as const;

    for (const d of defaults) {
      db.upsertCrawlTarget({
        ...d,
        nextRunAt: new Date().toISOString(),
        intervalMin: 15,
        hitsCount: 0,
        unchangedRuns: 0,
        failCount: 0
      });
    }
  }

  app.register(cors, { origin: '*' });

  // Static web frontend
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/'
    });
  }

  // --- API Endpoints ---

  // 1. Get Deals
  app.get('/api/deals', async (req) => {
    const query = req.query as {
      market?: MarketId | 'all';
      dealType?: DealType | 'all';
      sellerType?: SellerType | 'all';
      minDrop?: string;
      limit?: string;
    };

    const limit = parseInt(query.limit || '100', 10);
    const minDrop = parseInt(query.minDrop || '50', 10);

    let sql = `
      SELECT d.id, d.product_id as productId, d.ref_price as refPrice, d.new_price as newPrice,
             d.drop_pct as dropPct, d.deal_type as dealType, d.confidence,
             d.seller_name as sellerName, d.seller_type as sellerType,
             d.reasons_json as reasonsJson, d.confirmed, d.notified, d.detected_at as detectedAt,
             p.title, p.url, p.image, p.store, p.market, p.external_id as externalId
      FROM deals d
      JOIN products p ON d.product_id = p.id
      WHERE d.drop_pct >= ?
    `;
    const params: (string | number)[] = [minDrop];

    if (query.market && query.market !== 'all') {
      sql += ' AND p.market = ?';
      params.push(query.market);
    }
    if (query.dealType && query.dealType !== 'all') {
      sql += ' AND d.deal_type = ?';
      params.push(query.dealType);
    }
    if (query.sellerType && query.sellerType !== 'all') {
      sql += ' AND d.seller_type = ?';
      params.push(query.sellerType);
    }

    // Default sorting: Pricing errors first, then store sellers, then highest drop
    sql += ` ORDER BY CASE WHEN d.deal_type = 'pricing_error' THEN 1 ELSE 2 END ASC,
                     CASE WHEN d.seller_type = 'store' THEN 1 WHEN d.seller_type = 'fulfilled_by_store' THEN 2 ELSE 3 END ASC,
                     d.drop_pct DESC, d.detected_at DESC
             LIMIT ?`;
    params.push(limit);

    const rows = db.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      reasons: JSON.parse(r.reasonsJson || '[]'),
      confirmed: Boolean(r.confirmed)
    }));
  });

  // 2. Real-time Server-Sent Events (SSE) Stream
  app.get('/api/deals/stream', async (_req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial keepalive
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

    const dealListener = (event: any) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'new_deal', data: event })}\n\n`);
    };

    engine.on('deal', dealListener);

    reply.raw.on('close', () => {
      engine.off('deal', dealListener);
    });

    // Keepalive ping every 15s
    const pingInterval = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 15000);

    reply.raw.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // 3. Instant Scan Trigger
  app.post('/api/scan/instant', async (req) => {
    const body = (req.body || {}) as { market?: MarketId };
    console.log('[API] Triggering instant live scan...');
    const result = await engine.runInstantScan(body.market);
    return { success: true, result };
  });

  // 4. System Stats
  app.get('/api/stats', async () => {
    const crawlerStats = engine.getStats();
    const totalDeals = db.db.prepare('SELECT count(*) as count FROM deals').get() as { count: number };
    const pricingErrors = db.db.prepare("SELECT count(*) as count FROM deals WHERE deal_type = 'pricing_error'").get() as { count: number };
    const productsCount = db.db.prepare('SELECT count(*) as count FROM products').get() as { count: number };

    return {
      ...crawlerStats,
      dbTotalDeals: totalDeals.count,
      dbPricingErrors: pricingErrors.count,
      dbProductsCount: productsCount.count
    };
  });

  // 5. Open Solver Window
  app.post('/api/solver/open', async (req) => {
    const body = (req.body || {}) as { market: MarketId; url?: string };
    const manager = PersistentBrowserManager.getInstance();
    const url = body.url || (body.market?.startsWith('noon') ? 'https://www.noon.com/egypt-ar/' : 'https://www.amazon.eg');

    // Run without blocking response
    manager.openInteractiveSolver(url, body.market || 'amazon-eg').catch(console.error);
    return { success: true, message: 'Browser solver window opened on desktop' };
  });

  return { app, engine, db };
}

// Direct runner
if (process.argv[1] && process.argv[1].endsWith('api.ts')) {
  const PORT = parseInt(process.env.PORT || '4000', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  const { app, engine } = buildServer();

  app.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`\n======================================================`);
    console.log(`🚀 خادم «لقطة» يعمل الآن بنجاح على: ${address}`);
    console.log(`📡 واجهة الويب: http://localhost:${PORT}`);
    console.log(`⚡ التحديث اللحظي مفعّل عبر Server-Sent Events (SSE)`);
    console.log(`======================================================\n`);

    // Start background scanner
    engine.start(20000);
  });
}
