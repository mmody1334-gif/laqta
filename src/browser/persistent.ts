import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MarketId } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PersistentBrowserManager {
  private static instance: PersistentBrowserManager;
  private context: BrowserContext | null = null;
  private profileDir: string;

  private constructor() {
    this.profileDir = path.resolve(__dirname, '../../data/browser_profile');
    fs.mkdirSync(this.profileDir, { recursive: true });
  }

  public static getInstance(): PersistentBrowserManager {
    if (!PersistentBrowserManager.instance) {
      PersistentBrowserManager.instance = new PersistentBrowserManager();
    }
    return PersistentBrowserManager.instance;
  }

  public async getContext(options: { headless?: boolean } = {}): Promise<BrowserContext> {
    const headless = options.headless ?? true;

    if (!this.context) {
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        headless,
        viewport: { width: 1440, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'ar-EG',
        timezoneId: 'Africa/Cairo',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1440,900'
        ]
      });

      // Mask automation flags
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });
    }

    return this.context;
  }

  public async newPage(marketId: MarketId, options: { headless?: boolean } = {}): Promise<Page> {
    const ctx = await this.getContext(options);
    const page = await ctx.newPage();

    const isUae = marketId.endsWith('-ae');
    const locale = isUae ? 'ar-AE' : 'ar-EG';

    await page.setExtraHTTPHeaders({
      'Accept-Language': `${locale},ar;q=0.9,en-US;q=0.8,en;q=0.7`,
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    });

    return page;
  }

  public async openInteractiveSolver(url: string, _marketId: MarketId): Promise<void> {
    // Closes existing headless context if running, to open headful for user
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    const ctx = await this.getContext({ headless: false });
    const page = await ctx.newPage();
    console.log(`[SOLVER] Opening visible browser for: ${url}`);
    console.log('[SOLVER] Please solve captcha/verification. The session cookies will be saved automatically.');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
