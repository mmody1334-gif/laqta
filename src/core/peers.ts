import type { ProductSnapshot } from './types.js';

/**
 * Tokenizes Arabic and English text for title similarity comparison.
 */
export function tokenizeTitle(title: string): Set<string> {
  const clean = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();

  const stopWords = new Set([
    'في', 'من', 'على', 'إلى', 'عن', 'مع', 'أو', 'و', 'ثم', 'ال',
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'by'
  ]);

  const tokens = clean
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !stopWords.has(t));

  return new Set(tokens);
}

/**
 * Computes Jaccard similarity between two token sets.
 */
export function tokenOverlapRatio(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Finds similar peer products from a search/category page batch.
 * Requires title similarity >= 0.4 (e.g. same brand, model, specs).
 */
export function findSimilarPeers(
  target: ProductSnapshot,
  candidates: ProductSnapshot[],
  similarityThreshold = 0.35
): ProductSnapshot[] {
  const targetTokens = tokenizeTitle(target.title);
  if (targetTokens.size === 0) return [];

  const peers: ProductSnapshot[] = [];

  for (const candidate of candidates) {
    if (candidate.externalId === target.externalId) continue;
    if (candidate.currency !== target.currency) continue;
    if (!candidate.inStock || candidate.price <= 0) continue;

    const candidateTokens = tokenizeTitle(candidate.title);
    const score = tokenOverlapRatio(targetTokens, candidateTokens);

    if (score >= similarityThreshold) {
      peers.push(candidate);
    }
  }

  return peers;
}

/**
 * Calculates median peer price for a target product from a list of page snapshots.
 */
export function calculatePeerReferencePrice(
  target: ProductSnapshot,
  candidates: ProductSnapshot[]
): { peerPrice: number | null; peerCount: number; isHighConfidence: boolean } {
  const peers = findSimilarPeers(target, candidates);

  if (peers.length >= 2) {
    const prices = peers.map(p => p.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    return {
      peerPrice: median,
      peerCount: peers.length,
      isHighConfidence: true
    };
  }

  return {
    peerPrice: null,
    peerCount: peers.length,
    isHighConfidence: false
  };
}
