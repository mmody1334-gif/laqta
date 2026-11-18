import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { StoreAdapter } from './base.js';
import type {
  CrawlTarget,
  ProductSnapshot,
  Category,
  MarketId,
  Currency
} from '../core/types.js';
import { parsePrice } from '../core/price.js';
import { fetchPage } from '../crawler/fetch.js';
import { buildCrawlUrl } from '../crawler/urls.js';

export class NoonAdapter implements StoreAdapter {
  public store = 'noon' as const;

  public async listProducts(target: CrawlTarget, htmlOrJson?: string): Promise<ProductSnapshot[]> {
    let html = htmlOrJson;

    if (!html) {
      const url = buildCrawlUrl(target);
      const res = await fetchPage(url, target.market);
      html = res.content;
    }

    return this.parseListingHtml(html, target.market);
  }

  public parseListingHtml(html: string, marketId: MarketId): ProductSnapshot[] {
    const $ = cheerio.load(html);
    const products: ProductSnapshot[] = [];
    const currency: Currency = marketId.endsWith('-ae') ? 'AED' : 'EGP';

    $('a[class*="productBoxLink"]').each((_, el) => {
      const link = $(el);
      const href = link.attr('href') || '';
      if (!href.includes('/p/')) return;

      const skuMatch = href.match(/\/([A-Z0-9]+)\/p\/?/i);
      const externalId = skuMatch ? skuMatch[1] : '';
      if (!externalId) return;

      const titleEl = link.find('[data-qa="plp-product-box-name"]');
      const title = titleEl.text().trim() || titleEl.attr('title') || '';
      if (!title) return;

      // Extract image: prefer high-res CDN url, avoid placeholder
      let image = '';
      const imgElements = link.find('img');
      imgElements.each((_, imgEl) => {
        const src = $(imgEl).attr('src') || $(imgEl).attr('data-src') || '';
        if (src.includes('/p/') || src.includes('/pzsku/') || (src.includes('nooncdn') && !src.includes('placeholder'))) {
          image = src;
          return false;
        }
      });
      if (!image) {
        image = imgElements.first().attr('src') || '';
      }

      // Extract price
      const priceBox = link.find('[data-qa="plp-product-box-price"]');
      const amountStr = priceBox.find('strong[class*="amount"]').text().trim();
      const price = parsePrice(amountStr);
      if (!price || price <= 0) return;

      // List price (was / old price)
      const oldPriceStr = priceBox.find('[class*="oldPrice"], [class*="was"], [class*="strike"]').text().trim();
      const listPrice = parsePrice(oldPriceStr) || undefined;

      // Fulfillment
      const expressBadge = link.find(
        '[data-qa="product-noon-express"], img[alt*="noon-express"], [class*="express"]'
      );
      const isExpress = expressBadge.length > 0;

      const fullUrl = href.startsWith('http') ? href : `https://www.noon.com${href}`;

      products.push({
        externalId,
        title,
        url: fullUrl,
        image,
        price,
        listPrice,
        currency,
        inStock: true,
        fulfilledByStore: isExpress,
        sellerType: isExpress ? 'fulfilled_by_store' : 'unknown'
      });
    });

    return products;
  }

  public async discoverCategories(marketId: MarketId): Promise<Category[]> {
    const isUae = marketId.endsWith('-ae');
    const baseUrl = isUae ? 'https://www.noon.com/uae-ar/' : 'https://www.noon.com/egypt-ar/';

    const res = await fetchPage(baseUrl, marketId);
    const $ = cheerio.load(res.content);
    const categories: Category[] = [];
    const seen = new Set<string>();

    $('a[href*="/egypt-ar/"], a[href*="/uae-ar/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();

      // Filter out utility links
      if (
        !text ||
        href.includes('/p/') ||
        href.includes('/search') ||
        href.includes('/help') ||
        href.includes('/terms') ||
        href.includes('/privacy') ||
        href.includes('/cart') ||
        href.includes('/account')
      ) {
        return;
      }

      const match = href.match(/\/(?:egypt-ar|uae-ar)\/([a-z0-9-]+)\/?/i);
      if (match) {
        const slug = match[1];
        if (!seen.has(slug) && slug.length > 2) {
          seen.add(slug);
          categories.push({
            id: slug,
            name: text,
            url: href.startsWith('http') ? href : `https://www.noon.com${href}`,
            market: marketId,
            store: 'noon'
          });
        }
      }
    });

    return categories;
  }

  public async fetchProduct(url: string, marketId: MarketId, _page?: Page): Promise<ProductSnapshot> {
    const res = await fetchPage(url, marketId);
    const $ = cheerio.load(res.content);
    const currency: Currency = marketId.endsWith('-ae') ? 'AED' : 'EGP';

    const skuMatch = url.match(/\/([A-Z0-9]+)\/p\/?/i);
    const externalId = skuMatch ? skuMatch[1] : 'UNKNOWN';

    const title =
      $('h1[data-qa="pdp-product-name"]').text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('img[data-qa="pdp-gallery-image"]').attr('src') ||
      '';

    // Price
    const priceText =
      $('[data-qa="pdp-price-selling"] strong, [class*="sellingPrice"] strong, strong[class*="amount"]').first().text().trim();
    const price = parsePrice(priceText) || 0;

    const listPriceText =
      $('[data-qa="pdp-price-was"], [class*="oldPrice"]').first().text().trim();
    const listPrice = parsePrice(listPriceText) || undefined;

    // Seller & Fulfillment
    const sellerElement = $('[data-qa="pdp-seller-name"], [class*="sellerName"]');
    const seller = sellerElement.text().trim() || 'noon';

    const isNoonSold = seller.toLowerCase().includes('noon') || seller.includes('نون');
    const isExpress =
      $('[data-qa="pdp-noon-express"], [class*="expressBadge"], img[alt*="noon-express"]').length > 0;

    let sellerType: 'store' | 'fulfilled_by_store' | 'third_party' = 'third_party';
    if (isNoonSold) {
      sellerType = 'store';
    } else if (isExpress) {
      sellerType = 'fulfilled_by_store';
    }

    return {
      externalId,
      title,
      url,
      image,
      price,
      listPrice,
      currency,
      inStock: !res.content.includes('غير متوفر') && !res.content.includes('out of stock'),
      seller,
      sellerType,
      fulfilledByStore: isExpress || isNoonSold
    };
  }
}
