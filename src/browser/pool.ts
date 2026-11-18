import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { MarketId } from '../core/types.js';

export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private contexts = new Map<string, BrowserContext>();

  private constructor() {}

  public static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  public async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-size=1440,900'
        ]
      });
    }
    return this.browser;
  }

  public async getContext(marketId: MarketId): Promise<BrowserContext> {
    const isUae = marketId.endsWith('-ae');
    const locale = isUae ? 'ar-AE' : 'ar-EG';
    const timezoneId = isUae ? 'Asia/Dubai' : 'Africa/Cairo';

    const existing = this.contexts.get(marketId);
    if (existing) {
      return existing;
    }

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale,
      timezoneId,
      extraHTTPHeaders: {
        'Accept-Language': `${locale},ar;q=0.9,en-US;q=0.8,en;q=0.7`
      }
    });

    // Mask navigator.webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    this.contexts.set(marketId, context);
    return context;
  }

  public async newPage(marketId: MarketId): Promise<Page> {
    const context = await this.getContext(marketId);
    return context.newPage();
  }

  public async closeAll(): Promise<void> {
    for (const ctx of this.contexts.values()) {
      await ctx.close();
    }
    this.contexts.clear();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
