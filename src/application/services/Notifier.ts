export type AlertLevel = 'info' | 'warn' | 'error';

/** Port — tells a human something needs attention (chat webhook, email...). Must never throw. */
export interface Notifier {
  notify(level: AlertLevel, title: string, detail?: string): Promise<void>;
}
