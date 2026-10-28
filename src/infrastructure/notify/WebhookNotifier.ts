import type { AlertLevel, Notifier } from '@/application/services/Notifier';

const PREFIX: Record<AlertLevel, string> = { info: 'INFO', warn: 'WARNING', error: 'ALERT' };

/**
 * Posts alerts to ALERT_WEBHOOK_URL as `{ "text": "...", "content": "..." }` — that shape is
 * accepted as-is by Slack and Discord incoming webhooks. Always logs to the console too,
 * and never throws.
 */
export class WebhookNotifier implements Notifier {
  constructor(private readonly url = process.env.ALERT_WEBHOOK_URL) {}

  async notify(level: AlertLevel, title: string, detail?: string): Promise<void> {
    const text = `[${PREFIX[level]}] LYNX: ${title}${detail ? `\n${detail}` : ''}`;
    (level === 'error' ? console.error : console.warn)(`[alert] ${text}`);
    if (!this.url) return;
    try {
      await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch (err) {
      console.error('[alert] webhook delivery failed:', err instanceof Error ? err.message : err);
    }
  }
}
