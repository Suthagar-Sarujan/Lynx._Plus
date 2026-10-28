const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True if `text` contains any of `words` as a whole word/phrase ("rape" must not match "grape"). Plurals match. */
export function matchesAnyKeyword(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => {
    const k = escapeRegExp(w.trim().toLowerCase());
    return k !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${k}(?:s|es)?(?![\\p{L}\\p{N}])`, 'u').test(lower);
  });
}
