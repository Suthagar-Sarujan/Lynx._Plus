'use client';

import { useCallback, useEffect, useState } from 'react';
import { InputSwitch } from 'primereact/inputswitch';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';

type Platform = 'FACEBOOK' | 'INSTAGRAM';

interface Settings {
  enabled: boolean;
  platforms: Platform[];
  languages: string[];
  dailyCap: number;
  minGapMinutes: number;
  languageStaggerMinutes: number;
  activeFromHour: number;
  activeToHour: number;
  timezone: string;
  maxAgeHours: number;
  minPhotoWidth: number;
  blockedKeywords: string[];
  reviewKeywords: string[];
}

interface Failure {
  postId: string;
  platform: Platform;
  headline: string;
  error: string;
  attempts: number;
  at: string;
}

interface Status {
  settings: Settings;
  state: 'off' | 'outside-hours' | 'daily-cap' | 'ready';
  queuedToday: number;
  lastQueuedAt: string | null;
  eligible: number;
  held: number;
  failures: Failure[];
  metaProblem: string | null;
}

const STATE_TEXT: Record<Status['state'], { label: string; severity: 'success' | 'warning' | 'danger' | 'info' | undefined }> = {
  off: { label: 'Off — nothing is posted automatically', severity: 'danger' },
  'outside-hours': { label: 'On — waiting for active hours', severity: 'info' },
  'daily-cap': { label: 'On — daily limit reached', severity: 'warning' },
  ready: { label: 'On — posting', severity: 'success' }
};

const words = (text: string) => text.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
  return data;
}

/** The Autopilot page: kill switch, live status, settings, failed posts and Meta reconnection. */
export function AutopilotPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    try {
      const s: Status = await call('/api/automation/status', 'GET');
      setStatus(s);
      setForm((f) => (f && dirty ? f : s.settings));
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load the status.' });
    }
  }, [dirty]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function run<T>(key: string, fn: () => Promise<T>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'ok', text: ok });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  const toggle = (enabled: boolean) =>
    run('toggle', () => call('/api/automation', 'PATCH', { enabled }), enabled ? 'Autopilot is ON.' : 'Autopilot is OFF.');

  const save = () =>
    form &&
    run(
      'save',
      async () => {
        const { enabled: _enabled, ...rest } = form;
        await call('/api/automation', 'PATCH', rest);
        setDirty(false);
      },
      'Settings saved.'
    );

  const patch = (changes: Partial<Settings>) => {
    setForm((f) => (f ? { ...f, ...changes } : f));
    setDirty(true);
  };

  if (!status || !form) {
    return <div className="style-hint">{msg ? <span role="alert">{msg.text}</span> : 'Loading…'}</div>;
  }

  const st = STATE_TEXT[status.state];
  const num = (key: keyof Settings, label: string, min: number, max: number, suffix?: string) => (
    <div className="field">
      <label>{label}</label>
      <InputNumber value={form[key] as number} min={min} max={max} suffix={suffix} showButtons onValueChange={(e) => patch({ [key]: e.value ?? min } as Partial<Settings>)} />
    </div>
  );

  return (
    <div className="autopilot">
      {msg && <div className={`modal-msg ${msg.kind === 'error' ? 'error' : 'ok'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</div>}

      <section className="style-box autopilot-hero">
        <div className="autopilot-switch">
          <InputSwitch inputId="autopilot-on" checked={status.settings.enabled} disabled={busy === 'toggle'} onChange={(e) => toggle(!!e.value)} />
          <label htmlFor="autopilot-on"><strong>Autopilot</strong></label>
          <Tag value={st.label} severity={st.severity} />
        </div>
        <div className="autopilot-stats">
          <div><strong>{status.queuedToday}</strong> / {status.settings.dailyCap}<span>stories in the last 24 h</span></div>
          <div><strong>{status.eligible}</strong><span>fetched drafts waiting to publish</span></div>
          <div><strong>{status.held}</strong><span>held for your review</span></div>
          <div><strong>{status.lastQueuedAt ? new Date(status.lastQueuedAt).toLocaleTimeString([], { timeStyle: 'short' }) : '—'}</strong><span>last queued</span></div>
        </div>
        <div className="autopilot-actions">
          <Button label="Run now" icon="pi pi-play" size="small" outlined loading={busy === 'run'} onClick={() => run('run', () => call('/api/automation/run', 'POST'), 'Asked the worker to run now. It follows the same limits.')} />
          <Button label="Refresh" icon="pi pi-refresh" size="small" text onClick={load} />
        </div>
      </section>

      <section className="style-box">
        <h3>Facebook &amp; Instagram connection</h3>
        {status.metaProblem ? (
          <div className="modal-msg error" role="alert">{status.metaProblem}</div>
        ) : (
          <div className="modal-msg ok">Connected — the Facebook Page and Instagram account are reachable.</div>
        )}
        <div className="field">
          <label htmlFor="meta-token">Reconnect with a fresh token</label>
          <InputText id="meta-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste a token from the Graph API Explorer" />
          <div className="style-hint">It is exchanged for the Page&apos;s permanent token and stored on the server. The token is not kept in the browser.</div>
        </div>
        <Button
          label="Reconnect"
          icon="pi pi-link"
          size="small"
          disabled={token.trim().length < 20}
          loading={busy === 'meta'}
          onClick={() => run('meta', async () => { await call('/api/meta/token', 'POST', { token }); setToken(''); }, 'Reconnected.')}
        />
      </section>

      <section className="style-box">
        <h3>Failed posts{status.failures.length ? ` (${status.failures.length})` : ''}</h3>
        {status.failures.length === 0 ? (
          <div className="style-hint">Nothing has failed.</div>
        ) : (
          <ul className="autopilot-failures">
            {status.failures.map((f) => (
              <li key={`${f.postId}-${f.platform}`}>
                <div>
                  <Tag value={f.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} severity="danger" /> {f.headline.slice(0, 120)}
                  <div className="story-meta-sm" style={{ display: 'block' }}>{f.error} · {f.attempts} attempt{f.attempts === 1 ? '' : 's'} · {new Date(f.at).toLocaleString()}</div>
                </div>
                <Button
                  label="Retry"
                  icon="pi pi-replay"
                  size="small"
                  outlined
                  loading={busy === `retry-${f.postId}-${f.platform}`}
                  onClick={() => run(`retry-${f.postId}-${f.platform}`, () => call(`/api/posts/${f.postId}/publish`, 'POST', { platforms: [f.platform] }), 'Published.')}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="style-box">
        <h3>Settings</h3>
        <div className="field">
          <label>Post to</label>
          <div className="autopilot-row">
            {(['FACEBOOK', 'INSTAGRAM'] as Platform[]).map((p) => (
              <label key={p} className="autopilot-check">
                <Checkbox
                  checked={form.platforms.includes(p)}
                  onChange={(e) => patch({ platforms: e.checked ? [...form.platforms, p] : form.platforms.filter((x) => x !== p) })}
                />
                {p === 'FACEBOOK' ? 'Facebook' : 'Instagram'}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Languages (codes, comma separated; &quot;en&quot; is always the original)</label>
          <InputText value={form.languages.join(', ')} onChange={(e) => patch({ languages: words(e.target.value.toLowerCase()) })} placeholder="en, si, ta" />
        </div>
        <div className="autopilot-grid">
          {num('dailyCap', 'Stories per day (max, Instagram allows 100)', 1, 90)}
          {num('minGapMinutes', 'Spacing between stories', 0, 1440, ' min')}
          {num('languageStaggerMinutes', 'Gap between language versions', 0, 240, ' min')}
          {num('maxAgeHours', 'Ignore news older than', 1, 72, ' h')}
          {num('activeFromHour', 'Active from (hour)', 0, 23)}
          {num('activeToHour', 'Active until (hour)', 0, 23)}
          {num('minPhotoWidth', 'Skip photos smaller than (px, 0 = any)', 0, 4000)}
          <div className="field">
            <label>Timezone</label>
            <InputText value={form.timezone} onChange={(e) => patch({ timezone: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Never post (comma separated)</label>
          <InputTextarea rows={2} autoResize value={form.blockedKeywords.join(', ')} onChange={(e) => patch({ blockedKeywords: words(e.target.value) })} />
        </div>
        <div className="field">
          <label>Hold for my review (sensitive topics)</label>
          <InputTextarea rows={3} autoResize value={form.reviewKeywords.join(', ')} onChange={(e) => patch({ reviewKeywords: words(e.target.value) })} />
          <div className="style-hint">Stories containing these words stay as drafts. Whole words only.</div>
        </div>
        <Button label="Save settings" icon="pi pi-check" disabled={!dirty} loading={busy === 'save'} onClick={save} />
      </section>
    </div>
  );
}
