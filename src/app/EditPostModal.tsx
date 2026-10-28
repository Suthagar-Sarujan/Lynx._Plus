'use client';

import { useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { InputTextarea } from 'primereact/inputtextarea';
import { FileUpload } from 'primereact/fileupload';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { dateToInput, fromDateInput, toDateInput } from './dateLabels';
import { PostPreview } from './PostPreview';
import { HashtagInput } from './HashtagInput';
import { useLivePreview } from './useLivePreview';
import { HeadlineToggles } from './HeadlineToggles';
import { TextStyleControls, styleFromPost, styleToPayload } from './TextStyleControls';

export interface EditablePost {
  id: string;
  category?: string;
  language: string;
  mode: 'TEMPLATE' | 'DIRECT_IMAGE';
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
  dateLabel?: string | null;
  yearLabel?: string | null;
  badgeWord?: string | null;
  showBreaking?: boolean;
  showNews?: boolean;
  bodyText?: string | null;
  creditTag?: string | null;
  photoUrl?: string | null;
  renderedImageUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  scheduledAt?: string | null;
  bodyFont?: string | null;
  bodyFontSize?: number | null;
  bodyAlign?: string | null;
  bodyLineHeight?: number | null;
}

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM'];
const STATUS_SEVERITY = { DRAFT: undefined, SCHEDULED: 'warning', PUBLISHED: 'success', FAILED: 'danger' } as const;

/** Edit a draft, then save, schedule, publish or delete it. */
export function EditPostModal({
  post,
  onClose,
  onChanged
}: {
  post: EditablePost;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState(post);
  const [form, setForm] = useState({
    date: toDateInput(post.dateLabel, post.yearLabel),
    bodyText: post.bodyText ?? '',
    caption: post.caption ?? '',
    hashtags: post.hashtags ?? '',
    showBreaking: post.showBreaking ?? false,
    showNews: post.showNews ?? true
  });
  const [style, setStyle] = useState(() => styleFromPost(post));
  const [photo, setPhoto] = useState(post.photoUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Unsaved-changes guard: compare the editable state with what was last loaded or saved.
  const snapshot = () => JSON.stringify({ form, style, photo });
  const saved = useRef(snapshot());
  const dirty = snapshot() !== saved.current;

  const locked = current.status === 'PUBLISHED';
  const live = !locked && current.mode === 'TEMPLATE';
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const { preview, rendering, error: previewError } = useLivePreview({
    enabled: live,
    photo,
    bodyText: form.bodyText,
    date: form.date,
    language: current.language,
    style,
    showBreaking: form.showBreaking,
    showNews: form.showNews
  });


  const image = (live && preview) || current.renderedImageUrl || photo || '';

  /** Uploads a replacement photo right away so the preview can use it. */
  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!up.ok) throw new Error('Photo upload failed');
      setPhoto((await up.json()).url);
      setMsg(null);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setUploading(false);
    }
  }

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setMsg({ text: `${label}…` });
    try {
      setMsg({ text: await fn() });
      onChanged();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function api(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      const e = data.error;
      throw new Error(typeof e === 'string' ? e : 'Invalid input');
    }
    return data;
  }

  /** Saves the form (and the photo) and returns the updated post. */
  async function save(): Promise<EditablePost> {
    const { date, ...text } = form;
    const updated: EditablePost = await api(`/api/posts/${current.id}`, 'PATCH', { ...text, ...fromDateInput(date), ...styleToPayload(style), photoUrl: photo || null });
    setCurrent(updated);
    saved.current = snapshot();
    return updated;
  }

  const onSave = () => run('Saving', async () => { await save(); return 'Saved.'; });

  const onPublish = () =>
    run('Publishing', async () => {
      await save();
      await api(`/api/posts/${current.id}/publish`, 'POST', { platforms: PLATFORMS });
      setCurrent({ ...current, status: 'PUBLISHED' });
      return 'Published to Facebook + Instagram.';
    });

  const onSchedule = () =>
    run('Scheduling', async () => {
      if (!when) throw new Error('Pick a date and time first.');
      const at = when;
      await save();
      await api(`/api/posts/${current.id}/publish`, 'POST', { platforms: PLATFORMS, scheduledAt: at.toISOString() });
      setCurrent({ ...current, status: 'SCHEDULED', scheduledAt: at.toISOString() });
      return `Scheduled for ${at.toLocaleString()}.`;
    });

  function requestClose() {
    if (!dirty || locked) return onClose();
    confirmDialog({
      message: 'You have unsaved changes. Discard them?',
      header: 'Discard changes?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard',
      rejectLabel: 'Keep editing',
      acceptClassName: 'p-button-danger',
      accept: onClose
    });
  }

  const onDelete = () =>
    confirmDialog({
      message: 'Delete this story permanently?',
      header: 'Delete story',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () =>
        run('Deleting', async () => {
          await api(`/api/posts/${current.id}`, 'DELETE');
          onClose();
          return 'Deleted.';
        })
    });

  const header = (
    <div className="modal-head">
      <span>Edit story</span>
      <Tag value={current.status} severity={STATUS_SEVERITY[current.status]} className={current.status === 'DRAFT' ? 'tag-draft' : undefined} />
      {current.status === 'SCHEDULED' && current.scheduledAt && (
        <span className="page-sub">for {new Date(current.scheduledAt).toLocaleString()}</span>
      )}
    </div>
  );

  // Always-visible action bar: Delete on the left, Save + Publish on the right.
  const footer = locked ? undefined : (
    <div className="modal-footer">
      {msg && <Message className="modal-footer-msg" severity={msg.error ? 'error' : 'success'} text={msg.text} />}
      <div className="modal-actions">
        <Button label="Delete" icon="pi pi-trash" severity="danger" outlined disabled={busy} onClick={onDelete} />
        <span className="modal-actions-gap" />
        <Button label="Save changes" icon="pi pi-save" outlined disabled={busy} onClick={onSave} />
        <Button label="Publish now" icon="pi pi-send" disabled={busy} onClick={onPublish} />
      </div>
    </div>
  );

  return (
    <Dialog visible onHide={requestClose} header={header} footer={footer} modal dismissableMask draggable={false} style={{ width: 'min(1040px, 96vw)' }} breakpoints={{ '960px': '94vw', '640px': '100vw' }} contentClassName="modal-dialog-content">
      <ConfirmDialog />
      <div className="modal-body">
        <div className="modal-preview">
          <PostPreview image={image} rendering={rendering || uploading} error={previewError} caption={form.caption} hashtags={form.hashtags} />
          {!locked && (
            <div className="field">
              <label>Replace photo</label>
              <FileUpload
                mode="basic"
                accept="image/*"
                auto
                customUpload
                chooseLabel="Choose photo"
                disabled={uploading}
                uploadHandler={(e) => onPickPhoto(e.files[0] ?? null)}
              />
            </div>
          )}
        </div>

        <div className="editor" style={{ margin: 0 }}>
          {current.mode === 'TEMPLATE' && (
            <>
              <div className="field"><label>Body text (wrap key terms in **stars**)</label><InputTextarea rows={6} autoResize disabled={locked} value={form.bodyText} onChange={set('bodyText')} /></div>
              <HeadlineToggles value={form} onChange={(h) => setForm({ ...form, ...h })} disabled={locked} />
              <TextStyleControls value={style} onChange={setStyle} disabled={locked} />
              <div className="field">
                <label>Date shown on the image</label>
                <Calendar
                  value={form.date ? new Date(`${form.date}T00:00:00`) : null}
                  onChange={(e) => e.value instanceof Date && setForm({ ...form, date: dateToInput(e.value) })}
                  dateFormat="yy-mm-dd"
                  showIcon
                  icon="pi pi-calendar"
                  disabled={locked}
                />
              </div>
            </>
          )}
          <div className="field"><label>Caption</label><InputTextarea rows={4} autoResize disabled={locked} value={form.caption} onChange={set('caption')} /></div>
          <div className="field">
            <label>Hashtags</label>
            <HashtagInput
              value={form.hashtags}
              onChange={(hashtags) => setForm({ ...form, hashtags })}
              text={`${form.bodyText} ${form.caption}`}
              category={current.category ?? 'FOREIGN'}
              language={current.language}
              disabled={locked}
            />
          </div>

          {!locked && (
            <fieldset className="style-box schedule-box">
              <legend>Schedule</legend>
              <div className="schedule-row">
                <Calendar className="schedule-when" value={when} onChange={(e) => setWhen((e.value as Date) ?? null)} showTime hourFormat="24" showIcon icon="pi pi-calendar" minDate={new Date()} placeholder="Pick date and time" />
                <Button label="Schedule" icon="pi pi-clock" outlined disabled={busy || !when} onClick={onSchedule} />
              </div>
            </fieldset>
          )}

          {locked && msg && <Message severity={msg.error ? 'error' : 'success'} text={msg.text} />}
        </div>
      </div>
    </Dialog>
  );
}
