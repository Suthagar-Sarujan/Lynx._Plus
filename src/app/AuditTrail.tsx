'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';

interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  detail: string | null;
  ip: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Sign in',
  'auth.login_failed': 'Failed sign in',
  'auth.logout': 'Sign out',
  'post.create': 'Created',
  'post.update': 'Edited',
  'post.delete': 'Deleted',
  'post.publish': 'Published',
  'post.publish_failed': 'Publish failed',
  'post.schedule': 'Scheduled',
  'post.translate': 'Translated',
  'feed.refresh': 'Fetched news',
  'automation.update': 'Autopilot settings',
  'automation.run': 'Autopilot run',
  'meta.connect': 'Reconnected Facebook'
};
const SEVERITY: Record<string, 'success' | 'info' | 'warning' | 'danger' | undefined> = {
  'auth.login_failed': 'danger',
  'post.publish_failed': 'danger',
  'post.delete': 'danger',
  'post.publish': 'success',
  'post.schedule': 'warning',
  'post.create': 'info'
};

const label = (a: string) => ACTION_LABEL[a] ?? a;

/** "from → to" lines for an edit entry; other entries show their detail as compact JSON. */
function Detail({ row }: { row: AuditRow }) {
  if (!row.detail) return null;
  let data: unknown;
  try { data = JSON.parse(row.detail); } catch { return <code>{row.detail}</code>; }
  if (row.action === 'post.update' && data && typeof data === 'object') {
    return (
      <ul className="audit-changes">
        {Object.entries(data as Record<string, { from: unknown; to: unknown }>).map(([field, c]) => (
          <li key={field}>
            <strong>{field}</strong>: <span className="audit-from">{String(c.from ?? '∅')}</span> → <span className="audit-to">{String(c.to ?? '∅')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <code className="audit-json">{JSON.stringify(data)}</code>;
}

/** Read-only log of who did what, newest first. */
export function AuditTrail() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit?limit=1000');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(await res.json());
      setError('');
    } catch (err) {
      setError(`Could not load the audit trail (${err instanceof Error ? err.message : err}).`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).map((a) => ({ label: label(a), value: a })),
    [rows]
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!action || r.action === action) && (!q || `${r.actor} ${r.summary} ${r.entityId ?? ''}`.toLowerCase().includes(q)));
  }, [rows, search, action]);

  return (
    <>
      <div className="story-filter">
        <IconField iconPosition="left" className="story-search">
          <InputIcon className="pi pi-search" />
          <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, story or activity" />
        </IconField>
        <Dropdown value={action} options={actions} onChange={(e) => setAction(e.value)} placeholder="Any activity" showClear />
        <div className="story-filter-meta">
          <span>{shown.length} of {rows.length} entries</span>
          <Button label="Refresh" icon="pi pi-refresh" size="small" outlined loading={loading} onClick={load} />
        </div>
      </div>
      {error && <div className="modal-msg error" role="alert">{error}</div>}
      <DataTable
        value={shown}
        dataKey="id"
        paginator
        rows={20}
        rowsPerPageOptions={[20, 50, 100]}
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        scrollable
        stripedRows
        loading={loading}
        emptyMessage="Nothing has been recorded yet."
      >
        <Column header="When" field="at" style={{ minWidth: 170 }} body={(r: AuditRow) => new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })} />
        <Column header="Who" field="actor" style={{ minWidth: 110 }} />
        <Column header="Activity" field="action" style={{ minWidth: 140 }} body={(r: AuditRow) => <Tag value={label(r.action)} severity={SEVERITY[r.action]} className={SEVERITY[r.action] ? undefined : 'tag-draft'} />} />
        <Column
          header="Details"
          className="story-col"
          body={(r: AuditRow) => (
            <>
              <div>{r.summary}</div>
              <Detail row={r} />
              {(r.entityId || r.ip) && (
                <div className="story-meta-sm" style={{ display: 'block' }}>
                  {r.entityId && <>ID {r.entityId}</>}{r.entityId && r.ip && ' · '}{r.ip && <>IP {r.ip}</>}
                </div>
              )}
            </>
          )}
        />
      </DataTable>
    </>
  );
}
