'use client';

import { useState } from 'react';

export type PreviewTab = 'image' | 'facebook' | 'instagram';

const TABS: { id: PreviewTab; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' }
];

/** Caption text with #hashtags picked out the way the apps colour them. */
function Caption({ text, clamp, moreLabel }: { text: string; clamp: number; moreLabel: string }) {
  const [open, setOpen] = useState(false);
  const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
  return (
    <div className="sp-caption">
      <div className="sp-caption-text" style={open ? undefined : { WebkitLineClamp: clamp }}>
        {parts.map((p, i) => (p.startsWith('#') ? <span key={i} className="sp-tag">{p}</span> : p))}
      </div>
      {!open && text.length > 0 && (
        <button type="button" className="sp-more" onClick={() => setOpen(true)}>{moreLabel}</button>
      )}
    </div>
  );
}

/** Live view of the finished image, and how it will look as a Facebook or Instagram post. */
export function PostPreview({
  image,
  rendering,
  error,
  caption,
  hashtags
}: {
  image: string;
  rendering: boolean;
  error: string | null;
  caption: string;
  hashtags: string;
}) {
  const [tab, setTab] = useState<PreviewTab>('image');
  const text = [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n');

  const picture = image ? <img src={image} alt="Post preview" /> : <div className="empty-state">Add a photo and some text to see the preview.</div>;

  return (
    <div className="sp">
      <div className="sp-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`sp-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        {rendering && <span className="sp-status">Updating…</span>}
      </div>
      {error && <div className="modal-msg error">{error}</div>}

      {tab === 'image' && <div className="sp-image">{picture}</div>}

      {tab === 'facebook' && (
        <div className="fb-card">
          <div className="sp-head">
            <img className="sp-avatar" src="/brand/logo-sm.png" alt="" />
            <div>
              <div className="sp-name">LYNX._PLUS</div>
              <div className="sp-meta">Just now · Public</div>
            </div>
          </div>
          <Caption text={text} clamp={3} moreLabel="… See more" />
          <div className="sp-image">{picture}</div>
          <div className="fb-actions"><span>Like</span><span>Comment</span><span>Share</span></div>
        </div>
      )}

      {tab === 'instagram' && (
        <div className="ig-card">
          <div className="sp-head">
            <img className="sp-avatar ig" src="/brand/logo-sm.png" alt="" />
            <div className="sp-name">lynx._news</div>
          </div>
          <div className="ig-image">{picture}</div>
          <div className="ig-actions"><span>♡</span><span>💬</span><span>➤</span></div>
          <Caption text={`lynx._news ${text}`} clamp={2} moreLabel="… more" />
        </div>
      )}
    </div>
  );
}
