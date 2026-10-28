const STOPWORDS = new Set(
  'the a an and or but in on at to of for from by with as is are was were be been it its this that these those after before over under about into out up down new says said say amid'.split(' ')
);

const tokens = (headline: string): Set<string> =>
  new Set(
    headline
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );

/** Share of words two headlines have in common (0..1): |A ∩ B| / |A ∪ B|. */
export function headlineSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** True when `headline` reports the same event as one already seen (different outlets word it alike). */
export function isDuplicateHeadline(headline: string, known: string[], threshold = 0.55): boolean {
  return known.some((k) => headlineSimilarity(headline, k) >= threshold);
}
