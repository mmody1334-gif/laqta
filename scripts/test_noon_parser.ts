import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { parsePrice } from '../src/core/price.js';

function parseNoonListing(html: string) {
  const $ = cheerio.load(html);
  const products: any[] = [];

  $('a[class*="productBoxLink"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') || '';
    if (!href.includes('/p/')) return;

    // SKU is segment right before /p/
    const skuMatch = href.match(/\/([A-Z0-9]+)\/p\/?/i);
    const externalId = skuMatch ? skuMatch[1] : '';
    if (!externalId) return;

    const titleEl = link.find('[data-qa="plp-product-box-name"]');
    const title = titleEl.text().trim() || titleEl.attr('title') || '';
    if (!title) return;

    // Image
    const imgEl = link.find('img[loading="lazy"], img[src*="nooncdn"]');
    const image = imgEl.attr('src') || '';

    // Price
    const priceBox = link.find('[data-qa="plp-product-box-price"]');
    const amountStr = priceBox.find('strong[class*="amount"]').text().trim();
    const price = parsePrice(amountStr);
    if (!price || price <= 0) return;

    // List price (was / old price) if available
    const oldPriceStr = priceBox.find('[class*="oldPrice"], [class*="was"], [class*="strike"]').text().trim();
    const listPrice = parsePrice(oldPriceStr) || undefined;

    // Fulfillment
    const expressBadge = link.find('[data-qa="product-noon-express"], img[alt*="noon-express"], [class*="express"]');
    const isExpress = expressBadge.length > 0;

    const fullUrl = href.startsWith('http') ? href : `https://www.noon.com${href}`;

    products.push({
      externalId,
      title,
      url: fullUrl,
      image,
      price,
      listPrice,
      currency: 'EGP',
      inStock: true,
      fulfilledByStore: isExpress,
      sellerType: isExpress ? 'fulfilled_by_store' : 'unknown'
    });
  });

  return products;
}

const catHtml = fs.readFileSync('tests/fixtures/noon-eg/category_electronics_asc.html', 'utf-8');
const catProducts = parseNoonListing(catHtml);
console.log(`Parsed ${catProducts.length} products from category page:`);
console.log('Sample first 5 products:');
console.log(catProducts.slice(0, 5));

const searchHtml = fs.readFileSync('tests/fixtures/noon-eg/search_sandisk_asc.html', 'utf-8');
const searchProducts = parseNoonListing(searchHtml);
console.log(`\nParsed ${searchProducts.length} products from search page:`);
console.log('Sample first 5 products:');
console.log(searchProducts.slice(0, 5));
