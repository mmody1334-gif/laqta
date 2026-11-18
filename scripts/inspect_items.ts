import fs from 'node:fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('tests/fixtures/noon-eg/category_electronics_asc.html', 'utf-8');
const $ = cheerio.load(html);

console.log('=== Checking Price elements in DOM ===');
// Look for currency (جنيه or EGP) or price classes
$('*').each((i, el) => {
  const text = $(el).text().trim();
  const className = $(el).attr('class') || '';
  if (
    (className.includes('price') || className.includes('amount') || className.includes('currency')) &&
    text.length < 30 &&
    /\d/.test(text)
  ) {
    if (i < 20) {
      console.log(`Class: "${className}" -> Text: "${text}"`);
    }
  }
});

console.log('=== Checking Product Card Containers ===');
$('div[data-qa], a[data-qa], div[class*="product"], div[class*="grid"]').each((i, el) => {
  const qa = $(el).attr('data-qa');
  const cls = $(el).attr('class');
  if (qa || (cls && (cls.includes('productBox') || cls.includes('productContainer')))) {
    if (i < 10) {
      console.log(`Element QA: "${qa}", Class: "${cls}"`);
    }
  }
});
