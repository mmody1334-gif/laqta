import fs from 'node:fs';

const html = fs.readFileSync('tests/fixtures/noon-eg/category_electronics_asc.html', 'utf-8');
console.log(html.substring(635800, 638500));
