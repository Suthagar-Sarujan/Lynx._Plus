export interface TranslatedContent {
  bodyText: string;
  caption: string;
  hashtags: string;
}

/** Port — implemented against self-hosted LibreTranslate (open source). */
export interface TranslationService {
  translate(args: {
    targetLanguage: string; // e.g. "si", "ta", "hi" (ISO 639-1)
    bodyText: string;
    caption: string;
    hashtags: string;
  }): Promise<TranslatedContent>;
}
