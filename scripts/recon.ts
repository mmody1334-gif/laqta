import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBlockOrCaptcha } from '../src/crawler/fetch.js';
import type { MarketId } from '../src/core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  contentType: string;
  body: unknown;
}

export async function runRecon(
  url: string,
  marketId: MarketId = 'amazon-eg',
  slug = 'recon_output'
): Promise<{ status: number; size: number; title: string; isCaptcha: boolean; blockReason?: string }> {
  const isUae = marketId.endsWith('-ae');
  const locale = isUae ? 'ar-AE' : 'ar-EG';
  const timezoneId = isUae ? 'Asia/Dubai' : 'Africa/Cairo';

  const outputDir = path.resolve(__dirname, `../tests/fixtures/${marketId}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const htmlPath = path.join(outputDir, `${slug}.html`);
  const jsonPath = path.join(outputDir, `${slug}.network.json`);
  const pngPath = path.join(outputDir, `${slug}.png`);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  const networkEntries: NetworkEntry[] = [];

  const isHeadless = process.env.HEADLESS !== 'false';

  try {
    browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1440,900'
      ]
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale,
      timezoneId,
      extraHTTPHeaders: {
        'Accept-Language': `${locale},ar;q=0.9,en-US;q=0.8,en;q=0.7`,
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    page = await context.newPage();

    // Listen to network responses to catch any JSON data
    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json') || ct.includes('application/ld+json')) {
          const text = await res.text();
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // keep raw text if parse fails
          }
          networkEntries.push({
            url: res.url(),
            method: res.request().method(),
            status: res.status(),
            contentType: ct,
            body: parsed
          });
        }
      } catch {
        // ignore closed response errors
      }
    });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Brief stabilization pause
    await page.waitForTimeout(1500);

    const status = response ? response.status() : 200;
    const title = (await page.title()) || '';
    const content = await page.content();
    const size = Buffer.byteLength(content, 'utf-8');

    const blockCheck = detectBlockOrCaptcha(content, status);

    // Save artifacts
    fs.writeFileSync(htmlPath, content, 'utf-8');
    fs.writeFileSync(jsonPath, JSON.stringify(networkEntries, null, 2), 'utf-8');
    await page.screenshot({ path: pngPath, fullPage: false });

    // Print clear status line as required
    console.log(
      `[RECON] Status: ${status} | Size: ${size} bytes | Title: "${title}" | Captcha: ${
        blockCheck.isBlocked ? `YES (${blockCheck.reason})` : 'NO'
      }`
    );
    console.log(`[RECON] Saved:`);
    console.log(`  HTML: ${htmlPath}`);
    console.log(`  Network JSON (${networkEntries.length} entries): ${jsonPath}`);
    console.log(`  Screenshot: ${pngPath}`);

    return {
      status,
      size,
      title,
      isCaptcha: blockCheck.isBlocked,
      blockReason: blockCheck.reason
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('recon.ts')) {
  const targetUrl =
    process.argv[2] || 'https://www.amazon.eg/s?k=sandisk&s=price-asc-rank&low-price=1';
  const targetMarket = (process.argv[3] as MarketId) || 'amazon-eg';
  const targetSlug = process.argv[4] || 'search_sandisk_asc';

  console.log(`Starting recon on: ${targetUrl} (${targetMarket})`);
  runRecon(targetUrl, targetMarket, targetSlug)
    .then((result) => {
      if (result.isCaptcha) {
        process.exit(2);
      } else {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('[RECON] Error:', err.message);
      process.exit(1);
    });
}
