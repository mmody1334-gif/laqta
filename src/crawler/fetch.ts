import { request } from 'undici';
import { BrowserPool } from '../browser/pool.js';
import type { MarketId } from '../core/types.js';

export interface FetchResult {
  content: string;
  isHtml: boolean;
  status: number;
  usedBrowser: boolean;
  isBlocked: boolean;
  blockReason?: string;
  pageTitle?: string;
}

export function detectBlockOrCaptcha(html: string, status: number): { isBlocked: boolean; reason?: string } {
  if (status === 503) {
    return { isBlocked: true, reason: 'HTTP 503 Service Unavailable' };
  }
  if (status === 403) {
    return { isBlocked: true, reason: 'HTTP 403 Forbidden' };
  }

  const lower = html.toLowerCase();
  if (
    lower.includes('validatecaptcha') ||
    lower.includes('robot check') ||
    lower.includes('api-services-support@amazon.com') ||
    lower.includes('type the characters') ||
    lower.includes('enter the characters') ||
    html.includes('أدخل الأحرف') ||
    html.includes('كابتشا')
  ) {
    return { isBlocked: true, reason: 'Amazon Captcha / Bot Challenge' };
  }

  if (
    lower.includes('cf-browser-verification') ||
    lower.includes('cloudflare ray id') ||
    lower.includes('challenge-running')
  ) {
    return { isBlocked: true, reason: 'Cloudflare Challenge' };
  }

  return { isBlocked: false };
}

export async function fetchPage(
  url: string,
  marketId: MarketId,
  options: { allowBrowserFallback?: boolean; timeoutMs?: number } = {}
): Promise<FetchResult> {
  const allowBrowserFallback = options.allowBrowserFallback ?? true;
  const timeoutMs = options.timeoutMs ?? 30000;
  const isUae = marketId.endsWith('-ae');
  const locale = isUae ? 'ar-AE' : 'ar-EG';

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': `${locale},ar;q=0.9,en-US;q=0.8,en;q=0.7`,
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await request(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs
    });

    const bodyText = await res.body.text();
    clearTimeout(timer);

    const blockCheck = detectBlockOrCaptcha(bodyText, res.statusCode);
    const titleMatch = bodyText.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';

    if (blockCheck.isBlocked) {
      if (allowBrowserFallback) {
        return fetchWithBrowser(url, marketId, timeoutMs);
      }
      return {
        content: bodyText,
        isHtml: true,
        status: res.statusCode,
        usedBrowser: false,
        isBlocked: true,
        blockReason: blockCheck.reason,
        pageTitle
      };
    }

    if (res.statusCode >= 200 && res.statusCode < 300 && bodyText.length > 500) {
      return {
        content: bodyText,
        isHtml: true,
        status: res.statusCode,
        usedBrowser: false,
        isBlocked: false,
        pageTitle
      };
    }

    if (allowBrowserFallback) {
      return fetchWithBrowser(url, marketId, timeoutMs);
    }

    return {
      content: bodyText,
      isHtml: true,
      status: res.statusCode,
      usedBrowser: false,
      isBlocked: false,
      pageTitle
    };
  } catch (err) {
    clearTimeout(timer);
    if (allowBrowserFallback) {
      return fetchWithBrowser(url, marketId, timeoutMs);
    }
    throw err;
  }
}

export async function fetchWithBrowser(
  url: string,
  marketId: MarketId,
  timeoutMs = 30000
): Promise<FetchResult> {
  const pool = BrowserPool.getInstance();
  const page = await pool.newPage(marketId);

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    });

    // Brief wait for initial hydration
    await page.waitForTimeout(1000);

    const content = await page.content();
    const status = response ? response.status() : 200;
    const pageTitle = await page.title();
    const blockCheck = detectBlockOrCaptcha(content, status);

    return {
      content,
      isHtml: true,
      status,
      usedBrowser: true,
      isBlocked: blockCheck.isBlocked,
      blockReason: blockCheck.reason,
      pageTitle
    };
  } finally {
    await page.close();
  }
}
