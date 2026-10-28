import type { AutomationSettings as Row, PrismaClient } from '@prisma/client';
import type { Platform } from '@/domain/entities/Post';
import type { AutomationSettings, AutomationSettingsPatch, AutomationSettingsStore } from '@/application/services/AutomationSettings';

const list = (csv: string) => csv.split(',').map((s) => s.trim()).filter(Boolean);

function toSettings(row: Row): AutomationSettings {
  const languages = list(row.languages);
  return {
    enabled: row.enabled,
    platforms: list(row.platforms).filter((p): p is Platform => p === 'FACEBOOK' || p === 'INSTAGRAM'),
    languages: languages.includes('en') ? languages : ['en', ...languages],
    dailyCap: row.dailyCap,
    minGapMinutes: row.minGapMinutes,
    languageStaggerMinutes: row.languageStaggerMinutes,
    activeFromHour: row.activeFromHour,
    activeToHour: row.activeToHour,
    timezone: row.timezone,
    maxAgeHours: row.maxAgeHours,
    minPhotoWidth: row.minPhotoWidth,
    blockedKeywords: list(row.blockedKeywords),
    reviewKeywords: list(row.reviewKeywords)
  };
}

export class PrismaAutomationSettingsStore implements AutomationSettingsStore {
  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<AutomationSettings> {
    const row = await this.prisma.automationSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
    return toSettings(row);
  }

  async update(patch: AutomationSettingsPatch): Promise<AutomationSettings> {
    const { platforms, languages, blockedKeywords, reviewKeywords, ...rest } = patch;
    const data = {
      ...rest,
      ...(platforms && { platforms: platforms.join(',') }),
      ...(languages && { languages: languages.join(',') }),
      ...(blockedKeywords && { blockedKeywords: blockedKeywords.join(',') }),
      ...(reviewKeywords && { reviewKeywords: reviewKeywords.join(',') })
    };
    const row = await this.prisma.automationSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
    return toSettings(row);
  }
}
