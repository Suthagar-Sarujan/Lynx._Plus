const MAX_TAG_LENGTH = 30;

const STOPWORDS = new Set(
  'the a an and or but if in on at to of for from by with as is are was were be been it its this that these those he she they his her their we our you your i not no yes after before during over under about into out up down new says said'.split(' ')
);

const TITLES = new Set(
  'mr mrs ms dr sir actor actress director minister president prime deputy secretary chief senior junior chairman chairperson spokesperson commissioner superintendent inspector officer judge justice mayor governor captain coach'.split(' ')
);

/** "sri lanka power cuts" -> "#SriLankaPowerCuts". Null if nothing usable is left. */
export function toHashtag(phrase: string): string | null {
  const words = phrase
    .replace(/&apos;|&#39;|['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return null;
  const tag = words.map((w) => w[0]!.toLocaleUpperCase() + w.slice(1)).join('');
  return tag.length >= 2 && tag.length <= MAX_TAG_LENGTH ? `#${tag}` : null;
}

/** All #tags in a string, in order, without duplicates (case-insensitive). */
export function extractTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/#[\p{L}\p{N}_]+/gu)) {
    const key = m[0].toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m[0]);
    }
  }
  return out;
}

/**
 * Hashtags drawn from the story itself: **highlighted** terms first, then names
 * (runs of Capitalised words, e.g. "Tiger Shroff") and acronyms (UN, CBI).
 */
export function keywordTags(text: string, limit = 8): string[] {
  const out: string[] = [];
  const add = (phrase: string) => {
    const tag = toHashtag(phrase);
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  };

  for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) add(m[1]!);

  const plain = text.replace(/\*\*/g, '');
  const names = /(^|[.!?]\s+|["“(]\s*)?\b(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)*)/gu;
  for (const m of plain.matchAll(names)) {
    // A stopword ("Nellore and Tirupati") ends one name and starts the next, rather than joining them.
    const segments: string[][] = [[]];
    for (const w of m[2]!.split(/\s+/)) {
      if (STOPWORDS.has(w.toLowerCase())) segments.push([]);
      else segments[segments.length - 1]!.push(w);
    }

    segments.forEach((words, i) => {
      // "Deputy Secretary Barkha Tamrakar" -> "Barkha Tamrakar": a person's tag shouldn't include their job title.
      while (words.length > 1 && TITLES.has(words[0]!.toLowerCase().replace(/\.$/, ''))) words.shift();
      if (!words.length) return;
      const startsSentence = i === 0 && (m[1] !== undefined || m.index === 0);
      const isAcronym = words.length === 1 && /^\p{Lu}{2,6}$/u.test(words[0]!);
      // A lone capitalised word at the start of a sentence is usually just grammar ("Thunderstorms likely..."), not a name.
      if (words.length === 1 && startsSentence && !isAcronym) return;
      add(words.join(' '));
    });
  }
  return out.slice(0, limit);
}
