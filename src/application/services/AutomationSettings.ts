import type { Platform } from '@/domain/entities/Post';

export interface AutomationSettings {
  /** Kill switch: when false the autopilot imports drafts but never publishes. */
  enabled: boolean;
  platforms: Platform[];
  languages: string[]; // always includes the source language "en"
  dailyCap: number;
  minGapMinutes: number;
  languageStaggerMinutes: number;
  activeFromHour: number;
  activeToHour: number;
  timezone: string;
  maxAgeHours: number;
  /** Quality gate: the source photo needs at least this many pixels across the area the template shows (0 = off). */
  minPhotoWidth: number;
  blockedKeywords: string[];
  /** Sensitive topics: matching stories are left as drafts for human review instead of auto-posting. */
  reviewKeywords: string[];
}

export type AutomationSettingsPatch = Partial<AutomationSettings>;

/** Port — the single settings row that the dashboard edits and the autopilot obeys. */
export interface AutomationSettingsStore {
  get(): Promise<AutomationSettings>;
  update(patch: AutomationSettingsPatch): Promise<AutomationSettings>;
}
