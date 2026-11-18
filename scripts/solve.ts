import { PersistentBrowserManager } from '../src/browser/persistent.js';
import type { MarketId } from '../src/core/types.js';

async function main() {
  const market = (process.argv[2] as MarketId) || 'amazon-eg';
  let targetUrl = process.argv[3];

  if (!targetUrl) {
    if (market === 'amazon-eg') targetUrl = 'https://www.amazon.eg';
    else if (market === 'amazon-ae') targetUrl = 'https://www.amazon.ae';
    else if (market === 'noon-eg') targetUrl = 'https://www.noon.com/egypt-ar/';
    else if (market === 'noon-ae') targetUrl = 'https://www.noon.com/uae-ar/';
    else targetUrl = 'https://www.amazon.eg';
  }

  console.log('=====================================================');
  console.log(`🚀 فتح المتصفح التفاعلي لحل الكابتشا وتثبيت الجلسة`);
  console.log(`السوق: ${market} | الرابط: ${targetUrl}`);
  console.log(`الملفات والكوكيز ستُحفظ في: data/browser_profile`);
  console.log('=====================================================');

  const manager = PersistentBrowserManager.getInstance();
  await manager.openInteractiveSolver(targetUrl, market);

  console.log('\n✅ المتصفح مفتوح الآن أمامك.');
  console.log('حل الكابتشا أو سجل الدخول كما تشاء، واضغط Enter هنا عند الانتهاء لحفظ الجلسة وإغلاق المتصفح...');

  await new Promise((resolve) => {
    process.stdin.once('data', () => resolve(true));
  });

  console.log('💾 جاري حفظ بيانات الجلسة...');
  await manager.close();
  console.log('✨ تم حفظ الجلسة بنجاح! المتصفح جاهز الآن للعمل.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
