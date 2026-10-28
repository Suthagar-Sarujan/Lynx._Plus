import type { TranslationService, TranslatedContent } from '@/application/services/TranslationService';

/**
 * Open-source translation via LibreTranslate (AGPL) — self-host it with the
 * commented-out service in docker-compose.yml, or point LIBRETRANSLATE_URL
 * at any LibreTranslate-compatible mirror.
 *
 * Preserves **gold-highlighted** markers by translating the plain text and
 * re-wrapping the corresponding phrase — LibreTranslate has no native markup
 * passthrough, so this does a best-effort re-insertion.
 */
export class LibreTranslateService implements TranslationService {
  constructor(
    private readonly baseUrl: string = process.env.LIBRETRANSLATE_URL ?? 'http://localhost:5000',
    private readonly apiKey: string = process.env.LIBRETRANSLATE_API_KEY ?? ''
  ) {}

  async translate(args: {
    targetLanguage: string;
    bodyText: string;
    caption: string;
    hashtags: string;
  }): Promise<TranslatedContent> {
    const [bodyText, caption, hashtags] = await Promise.all([
      this.translateWithHighlights(args.bodyText, args.targetLanguage),
      this.translateText(args.caption, args.targetLanguage),
      // Hashtags are kept as-is — translating #BreakingNews loses the tag's
      // searchability, so only the surrounding caption/body get translated.
      Promise.resolve(args.hashtags)
    ]);
    return { bodyText, caption, hashtags };
  }

  private async translateWithHighlights(text: string, target: string): Promise<string> {
    const highlighted: string[] = [];
    const stripped = text.replace(/\*\*(.+?)\*\*/g, (_, term) => {
      highlighted.push(term);
      return `\u0001${highlighted.length - 1}\u0001`; // placeholder token
    });

    const translatedStripped = await this.translateText(stripped, target);
    const translatedHighlights = await Promise.all(
      highlighted.map((term) => this.translateText(term, target))
    );

    return translatedStripped.replace(/\u0001(\d+)\u0001/g, (_, idx) => {
      const term = translatedHighlights[Number(idx)] ?? highlighted[Number(idx)];
      return `**${term}**`;
    });
  }

  private async translateText(text: string, target: string): Promise<string> {
    if (!text.trim()) return text;

    const res = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'en',
        target,
        format: 'text',
        api_key: this.apiKey || undefined
      })
    });

    if (!res.ok) {
      throw new Error(`LibreTranslate request failed (${res.status}). Is it running at ${this.baseUrl}?`);
    }

    const data = await res.json();
    return data.translatedText as string;
  }
}
