import fs from 'node:fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('tests/fixtures/noon-eg/category_electronics_asc.html', 'utf-8');
const $ = cheerio.load(html);

console.log('=== Checking JSON-LD ===');
$('script[type="application/ld+json"]').each((i, el) => {
  console.log(`JSON-LD #${i}:`, $(el).html()?.substring(0, 300));
});

console.log('=== Checking __NEXT_DATA__ or similar ===');
const nextData = $('#__NEXT_DATA__').html();
if (nextData) {
  console.log('Found #__NEXT_DATA__! Length:', nextData.length);
  try {
    const parsed = JSON.parse(nextData);
    console.log('Keys in __NEXT_DATA__:', Object.keys(parsed));
    if (parsed.props?.pageProps) {
      console.log('Keys in pageProps:', Object.keys(parsed.props.pageProps));
      const catalog = parsed.props.pageProps.catalog;
      if (catalog) {
        console.log('Catalog keys:', Object.keys(catalog));
        if (catalog.hits) {
          console.log(`Found catalog.hits: ${catalog.hits.length} items!`);
          console.log('First hit sample:', JSON.stringify(catalog.hits[0], null, 2).substring(0, 500));
        }
      }
    }
  } catch (err: any) {
    console.error('Error parsing __NEXT_DATA__:', err.message);
  }
} else {
  console.log('No #__NEXT_DATA__ tag found. Checking other scripts...');
  $('script').each((i, el) => {
    const text = $(el).html() || '';
    if (text.includes('catalog') || text.includes('product') || text.includes('sku')) {
      console.log(`Script #${i} contains keywords, length: ${text.length}`);
    }
  });
}

console.log('=== Checking Product Links in DOM ===');
$('a[href*="/p-"], a[href*="/product/"], a[href*="/N"]').each((i, el) => {
  if (i < 5) {
    console.log(`Product Link #${i}:`, $(el).attr('href'));
  }
});
