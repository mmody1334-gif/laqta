import fs from 'node:fs';

const html = fs.readFileSync('tests/fixtures/noon-eg/category_electronics_asc.html', 'utf-8');
const searchStr = 'جريد 2';
let index = 0;
while ((index = html.indexOf(searchStr, index)) !== -1) {
  console.log(`Found "${searchStr}" at index ${index}:`);
  console.log(html.substring(Math.max(0, index - 100), Math.min(html.length, index + 300)));
  console.log('--------------------------------------------------');
  index += searchStr.length;
}
