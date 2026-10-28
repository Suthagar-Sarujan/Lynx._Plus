'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableRowClickEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';

export interface StoryRow {
  id: string;
  language: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
  dateLabel?: string | null;
  yearLabel?: string | null;
  bodyText?: string | null;
  photoUrl?: string | null;
  renderedImageUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  updatedAt: string;
}

interface Filter {
  search: string;
  status: string | null;
  lastHours: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  timeFrom: Date | null;
  timeTo: Date | null;
}

const EMPTY: Filter = { search: '', status: null, lastHours: null, dateFrom: null, dateTo: null, timeFrom: null, timeTo: null };

const LAST_HOURS = [1, 3, 6, 12, 24, 48, 72].map((h) => ({ label: `Last ${h} hour${h === 1 ? '' : 's'}`, value: h }));
const STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'].map((s) => ({ label: s, value: s }));
const SEVERITY = { DRAFT: undefined, SCHEDULED: 'warning', PUBLISHED: 'success', FAILED: 'danger' } as const;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
const plain = (s?: string | null) => (s ?? '').replace(/\*\*/g, '');
const titleOf = (p: StoryRow) => plain(p.bodyText ?? p.caption) || 'Untitled';

function matches(p: StoryRow, f: Filter, now: number) {
  const at = new Date(p.updatedAt);
  if (Number.isNaN(at.getTime())) return true;

  if (f.status && p.status !== f.status) return false;
  if (f.lastHours && now - at.getTime() > f.lastHours * 3600_000) return false;
  if (f.dateFrom && dayStart(at) < dayStart(f.dateFrom)) return false;
  if (f.dateTo && dayStart(at) > dayStart(f.dateTo)) return false;

  const t = minutes(at);
  const from = f.timeFrom ? minutes(f.timeFrom) : null;
  const to = f.timeTo ? minutes(f.timeTo) : null;
  if (from !== null && to !== null && from > to) {
    if (t < from && t > to) return false; // overnight window, e.g. 22:00 → 02:00
  } else {
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
  }

  const q = f.search.trim().toLowerCase();
  if (q && !`${p.bodyText ?? ''} ${p.caption ?? ''} ${p.hashtags ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateValue = (d: Date | null) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');
const toTimeValue = (d: Date | null) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '');

/** Native date/time input with an inline label; the filter state keeps Date objects. */
function NativeField({ type, label, value, min, max, onChange }: {
  type: 'date' | 'time';
  label: string;
  value: Date | null;
  min?: Date | null;
  max?: Date | null;
  onChange: (v: Date | null) => void;
}) {
  const parse = (s: string) => {
    if (!s) return null;
    if (type === 'date') {
      const [a = 0, b = 1, c = 1] = s.split('-').map(Number);
      return new Date(a, b - 1, c);
    }
    const [h = 0, m = 0] = s.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };
  const fmt = type === 'date' ? toDateValue : toTimeValue;

  return (
    <label className="native-field">
      <span className="native-field-label">{label}</span>
      <input
        type={type}
        aria-label={label}
        value={fmt(value)}
        min={min ? fmt(min) : undefined}
        max={max ? fmt(max) : undefined}
        onChange={(e) => onChange(parse(e.target.value))}
        onClick={(e) => e.currentTarget.showPicker?.()}
      />
    </label>
  );
}

/** Our own rendered/uploaded images are served as small cached thumbnails; anything else is used as-is. */
function thumbUrl(src: string): string {
  try {
    const rel = new URL(src, window.location.origin).pathname.replace(/^\//, '');
    if (/^(generated|uploads)\/[\w.-]+$/.test(rel)) return `/api/thumb?f=${encodeURIComponent(rel)}`;
  } catch {
    /* not a URL: fall through */
  }
  return src;
}

/** Fixed-size thumbnail with a shimmer while loading and an icon placeholder when the image is missing or broken. */
function Thumb({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!src) return setState('error');
    const img = ref.current;
    // Cached images can finish loading before React attaches onLoad.
    setState(img?.complete ? (img.naturalWidth > 0 ? 'ok' : 'error') : 'loading');
  }, [src, attempt]);

  // A busy server can drop an image once; try again before settling on the placeholder.
  function onError() {
    if (attempt < 1) {
      setTimeout(() => setAttempt((n) => n + 1), 1500);
    } else {
      setState('error');
    }
  }

  return (
    <div className={`thumb thumb-${state}`} {...(state === 'error' ? { role: 'img', 'aria-label': 'No image available' } : {})}>
      {src && state !== 'error' && (
        <img key={attempt} ref={ref} src={thumbUrl(src)} alt={alt} width={56} height={56} loading="lazy" decoding="async" onLoad={() => setState('ok')} onError={onError} />
      )}
      {state === 'error' && <i className="pi pi-image" aria-hidden="true" />}
    </div>
  );
}

/** Searchable, filterable, sortable table of stories. Filters on each post's last-updated time (local time zone). */
export function StoryList<T extends StoryRow>({ posts, onOpen, emptyText }: { posts: T[]; onOpen: (post: T) => void; emptyText: string }) {
  const [f, setF] = useState<Filter>(EMPTY);
  const set = (patch: Partial<Filter>) => setF((cur) => ({ ...cur, ...patch }));
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  const rows = useMemo(() => {
    const now = Date.now();
    return posts.filter((p) => matches(p, f, now));
  }, [posts, f]);

  const filters = (
    <div className="story-filter story-filter-stories">
      <IconField iconPosition="left" className="story-search">
        <InputIcon className="pi pi-search" />
        <InputText value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search stories, captions, hashtags" />
      </IconField>
      <Dropdown value={f.status} options={STATUSES} onChange={(e) => set({ status: e.value })} placeholder="Any status" showClear />
      <Dropdown value={f.lastHours} options={LAST_HOURS} onChange={(e) => set({ lastHours: e.value })} placeholder="Any time" showClear />
      <NativeField type="date" label="Date from" value={f.dateFrom} max={f.dateTo} onChange={(v) => set({ dateFrom: v })} />
      <NativeField type="date" label="Date to" value={f.dateTo} min={f.dateFrom} onChange={(v) => set({ dateTo: v })} />
      <NativeField type="time" label="Time from" value={f.timeFrom} onChange={(v) => set({ timeFrom: v })} />
      <NativeField type="time" label="Time to" value={f.timeTo} onChange={(v) => set({ timeTo: v })} />
      <div className="story-filter-meta">
        <span>{active ? `${rows.length} of ${posts.length} stories` : `${posts.length} stories`}</span>
        {active && <Button label="Clear" icon="pi pi-filter-slash" size="small" outlined onClick={() => setF(EMPTY)} />}
      </div>
    </div>
  );

  return (
    <>
    {filters}
    <DataTable
      value={rows}
      dataKey="id"
      paginator
      rows={20}
      scrollable
      paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      rowsPerPageOptions={[20, 50, 100]}
      sortField="updatedAt"
      sortOrder={-1}
      stripedRows
      rowHover
      rowClassName={() => 'story-table-row'}
      onRowClick={(e: DataTableRowClickEvent) => onOpen(e.data as T)}
      emptyMessage={posts.length === 0 ? emptyText : 'No stories match these filters.'}
    >
      <Column
        header=""
        style={{ width: 80, minWidth: 80 }}
        body={(p: T) => {
          const image = p.renderedImageUrl ?? p.photoUrl ?? '';
          return <Thumb src={image} alt={titleOf(p)} />;
        }}
      />
      <Column
        header="Story"
        headerClassName="story-col"
        bodyClassName="story-col"
        body={(p: T) => (
          <>
            <button type="button" className="story-title" title={titleOf(p)} onClick={(e) => { e.stopPropagation(); onOpen(p); }}>{titleOf(p)}</button>
            <span className="story-meta-sm">{new Date(p.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </>
        )}
      />
      <Column header="Status" field="status" sortable body={(p: T) => <Tag value={p.status} severity={SEVERITY[p.status]} className={p.status === 'DRAFT' ? 'tag-draft' : undefined} />} />
      <Column header="Lang" field="language" sortable headerClassName="hide-md" bodyClassName="hide-md" body={(p: T) => p.language.toUpperCase()} />
      <Column header="Story date" headerClassName="hide-md" bodyClassName="hide-md date-col" body={(p: T) => `${p.dateLabel ?? ''} ${p.yearLabel ?? ''}`.trim()} />
      <Column
        header="Updated"
        field="updatedAt"
        sortable
        headerClassName="hide-sm date-col"
        bodyClassName="hide-sm date-col"
        body={(p: T) => new Date(p.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
      />
      <Column header="" headerClassName="hide-md" bodyClassName="hide-md" style={{ width: 48 }} body={() => <i className="pi pi-chevron-right" />} />
    </DataTable>
    </>
  );
}
