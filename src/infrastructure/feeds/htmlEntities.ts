const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
  rupee: '₹', pound: '£', euro: '€', copy: '©', reg: '®', deg: '°', middot: '·', bull: '•'
};

function fromCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/** Decodes numeric (&#8217; / &#x2019;) and common named (&rsquo;) entities, including double-encoded ones (&amp;#8217;). */
export function decodeEntities(input: string): string {
  const once = (s: string) =>
    s
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
  let out = once(input);
  // "&amp;#8217;" decodes to "&#8217;" on the first pass; a second pass finishes the job.
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(out)) out = once(out);
  return out;
}
