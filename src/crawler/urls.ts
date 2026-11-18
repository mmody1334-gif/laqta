import type { CrawlTarget, MarketId } from '../core/types.js';

export function getMarketBaseUrl(market: MarketId): string {
  switch (market) {
    case 'amazon-eg':
      return 'https://www.amazon.eg';
    case 'amazon-ae':
      return 'https://www.amazon.ae';
    case 'noon-eg':
      return 'https://www.noon.com/egypt-ar';
    case 'noon-ae':
      return 'https://www.noon.com/uae-ar';
  }
}

export function buildCrawlUrl(target: CrawlTarget): string {
  const base = getMarketBaseUrl(target.market);

  if (target.store === 'amazon') {
    return buildAmazonUrl(base, target);
  } else {
    return buildNoonUrl(base, target);
  }
}

export function buildAmazonUrl(base: string, target: CrawlTarget): string {
  let sortQuery = '';
  if (target.mode === 'price-asc') {
    sortQuery = 's=price-asc-rank&low-price=1';
  } else if (target.mode === 'newest') {
    sortQuery = 's=date-desc-rank';
  }

  if (target.kind === 'keyword') {
    const q = encodeURIComponent(target.value);
    const queryParts = [`k=${q}`];
    if (sortQuery) queryParts.push(sortQuery);
    return `${base}/s?${queryParts.join('&')}`;
  }

  if (target.kind === 'category') {
    const val = target.value.trim();
    if (val.startsWith('http://') || val.startsWith('https://')) {
      const url = new URL(val);
      if (sortQuery) {
        const [k1, v1] = sortQuery.split('&')[0].split('=');
        url.searchParams.set(k1, v1);
        if (sortQuery.includes('low-price=1')) {
          url.searchParams.set('low-price', '1');
        }
      }
      return url.toString();
    }
    // Node id or path
    if (/^\d+$/.test(val)) {
      return `${base}/s?rh=n%3A${val}&${sortQuery}`;
    }
    const cleanPath = val.startsWith('/') ? val : `/${val}`;
    const delimiter = cleanPath.includes('?') ? '&' : '?';
    return `${base}${cleanPath}${sortQuery ? `${delimiter}${sortQuery}` : ''}`;
  }

  if (target.kind === 'deals') {
    return `${base}/deals`;
  }

  // watch mode: direct URL
  return target.value;
}

export function buildNoonUrl(base: string, target: CrawlTarget): string {
  let sortQuery = '';
  if (target.mode === 'price-asc') {
    sortQuery = 'sort[by]=price&sort[dir]=asc&price[min]=1';
  } else if (target.mode === 'newest') {
    sortQuery = 'sort[by]=created_at&sort[dir]=desc';
  } else if (target.mode === 'discount') {
    sortQuery = 'sort[by]=discount&sort[dir]=desc';
  }

  if (target.kind === 'keyword') {
    const q = encodeURIComponent(target.value);
    const queryParts = [`q=${q}`];
    if (sortQuery) queryParts.push(sortQuery);
    return `${base}/search/?${queryParts.join('&')}`;
  }

  if (target.kind === 'category') {
    const val = target.value.trim();
    if (val.startsWith('http://') || val.startsWith('https://')) {
      const url = new URL(val);
      if (target.mode === 'price-asc') {
        url.searchParams.set('sort[by]', 'price');
        url.searchParams.set('sort[dir]', 'asc');
        url.searchParams.set('price[min]', '1');
      } else if (target.mode === 'newest') {
        url.searchParams.set('sort[by]', 'created_at');
        url.searchParams.set('sort[dir]', 'desc');
      }
      return url.toString();
    }
    const cleanSlug = val.replace(/^\/+|\/+$/g, '');
    const delimiter = '?';
    return `${base}/${cleanSlug}/${sortQuery ? `${delimiter}${sortQuery}` : ''}`;
  }

  if (target.kind === 'deals') {
    return `${base}/mega-deal/`;
  }

  // watch
  return target.value;
}
