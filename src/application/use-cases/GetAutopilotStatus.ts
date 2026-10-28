import type { AutomationSettings, AutomationSettingsStore } from '@/application/services/AutomationSettings';
import type { AutopilotStore, FailedJob } from '@/application/services/AutopilotStore';
import { matchesAnyKeyword } from '@/application/util/keywords';
import { isWithinActiveHours } from '@/application/use-cases/RunAutopilot';

export interface AutopilotStatus {
  settings: AutomationSettings;
  /** Why the autopilot would not post right now ("ready" when it would). */
  state: 'off' | 'outside-hours' | 'daily-cap' | 'ready';
  queuedToday: number;
  lastQueuedAt: string | null;
  /** Fresh drafts the autopilot may pick, and those held back for a person (sensitive words). */
  eligible: number;
  held: number;
  failures: (Omit<FailedJob, 'at'> & { at: string })[];
  /** Null when the Meta credentials work, otherwise what is wrong. */
  metaProblem: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the Autopilot page shows, in one call. */
export class GetAutopilotStatus {
  constructor(
    private readonly settings: AutomationSettingsStore,
    private readonly store: AutopilotStore,
    private readonly metaHealth: () => Promise<string | null>
  ) {}

  async execute(now = new Date()): Promise<AutopilotStatus> {
    const settings = await this.settings.get();
    const [queuedToday, last, candidates, failures, metaProblem] = await Promise.all([
      this.store.countStoriesQueuedSince(new Date(now.getTime() - DAY_MS)),
      this.store.lastQueuedAt(),
      this.store.findCandidates(new Date(now.getTime() - settings.maxAgeHours * 3_600_000)),
      this.store.listFailedJobs(20),
      this.metaHealth().catch((e) => (e instanceof Error ? e.message : String(e)))
    ]);

    const sensitive = [...settings.blockedKeywords, ...settings.reviewKeywords];
    const held = candidates.filter((c) => matchesAnyKeyword(c.headline, sensitive)).length;

    const state: AutopilotStatus['state'] = !settings.enabled
      ? 'off'
      : !isWithinActiveHours(settings, now)
        ? 'outside-hours'
        : queuedToday >= settings.dailyCap
          ? 'daily-cap'
          : 'ready';

    return {
      settings,
      state,
      queuedToday,
      lastQueuedAt: last?.toISOString() ?? null,
      eligible: candidates.length - held,
      held,
      failures: failures.map((f) => ({ ...f, at: f.at.toISOString() })),
      metaProblem
    };
  }
}
