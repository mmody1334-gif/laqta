import { NoonAdapter } from '../src/adapters/noon.js';
import { AmazonAdapter } from '../src/adapters/amazon.js';
import type { MarketId, CrawlMode, CrawlTargetKind } from '../src/core/types.js';

async function runSmoke() {
  const market = (process.argv[2] as MarketId) || 'noon-eg';
  const mode = (process.argv[3] as CrawlMode) || 'price-asc';
  const value = process.argv[4] || 'electronics-and-mobiles';
  const kind: CrawlTargetKind = value.includes('/') || value.includes('-') ? 'category' : 'keyword';

  console.log(`Running smoke test: Market=${market}, Mode=${mode}, Value=${value}`);

  const adapter = market.startsWith('noon') ? new NoonAdapter() : new AmazonAdapter();

  const products = await adapter.listProducts({
    store: market.startsWith('noon') ? 'noon' : 'amazon',
    market,
    kind,
    value,
    mode,
    priority: 10,
    nextRunAt: new Date().toISOString(),
    intervalMin: 60,
    hitsCount: 0,
    unchangedRuns: 0,
    failCount: 0
  });

  console.log(`\nSuccessfully fetched ${products.length} products:`);
  console.log('----------------------------------------------------');
  for (const [index, p] of products.slice(0, 25).entries()) {
    const listPriceStr = p.listPrice ? ` (was ${p.listPrice})` : '';
    console.log(
      `#${index + 1} [${p.externalId}] ${p.price} ${p.currency}${listPriceStr} | ${p.title.substring(0, 50)}...`
    );
  }
}

runSmoke().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
