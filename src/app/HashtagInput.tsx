'use client';

import { useEffect, useRef, useState } from 'react';

interface Suggestion {
  tag: string;
  source: 'story' | 'related' | 'used' | 'popular';
  note?: string;
}

const SOURCE_LABEL: Record<Suggestion['source'], string> = {
  story: 'from your story',
  related: 'related',
  used: 'used before',
  popular: 'popular'
};

const TAG_PATTERN = /#[\p{L}\p{N}_]+/gu;

/** "  #tiger shroff " -> "#tiger" style normalisation of one typed token. */
function normalise(raw: string): string | null {
  const body = raw.replace(/[^\p{L}\p{N}_]/gu, '');
  return body ? `#${body}` : null;
}

/**
 * Hashtag field with live suggestions: real tags related to the story's names, tags that are
 * popular right now, and ones used on earlier posts - each checked against real usage. The value
 * stays a plain space-separated string ("#News #SriLanka").
 */
export function HashtagInput({
  value,
  onChange,
  text,
  category,
  language,
  disabled
}: {
  value: string;
  onChange: (next: string) => void;
  text: string; // news text + caption, used to suggest names from the story
  category: string;
  language: string;
  disabled?: boolean;
}) {
  const tags = value.match(TAG_PATTERN) ?? [];
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch as the user types (and when the story text changes), after a short pause.
  useEffect(() => {
    if (disabled) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/hashtags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, text: text.slice(0, 4000), category, language }),
          signal: ctrl.signal
        });
        if (res.ok) setSuggestions((await res.json()).suggestions);
      } catch {
        /* aborted or offline: keep whatever suggestions we had */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, text, category, language, disabled]);

  const setTags = (next: string[]) => onChange(next.join(' '));
  const add = (raw: string) => {
    const tag = normalise(raw);
    if (tag && !has(tag)) setTags([...tags, tag]);
    setQuery('');
    setActive(0);
  };
  const remove = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const available = suggestions.filter((s) => !has(s.tag));
  const typing = query.trim().length > 0;
  const typed = normalise(query);
  // While typing: the matching suggestions, and the typed text itself as a custom tag.
  const list: Suggestion[] = typing
    ? [
        ...available,
        ...(typed && !has(typed) && !available.some((s) => s.tag.toLowerCase() === typed.toLowerCase())
          ? [{ tag: typed, source: 'popular' as const, note: 'add as typed' }]
          : [])
      ]
    : [];

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % list.length);
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ' ') {
      if (!typing) return; // let Tab move on and Enter/space behave normally when nothing is typed
      e.preventDefault();
      // Enter/Tab take the highlighted suggestion; space/comma commit exactly what was typed.
      add(e.key === 'Enter' || e.key === 'Tab' ? (list[active]?.tag ?? query) : query);
    } else if (e.key === 'Backspace' && !query && tags.length) {
      remove(tags[tags.length - 1]!);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  return (
    <div className="ht">
      <div className={`ht-box ${focused ? 'focus' : ''} ${disabled ? 'disabled' : ''}`} onClick={() => inputRef.current?.focus()}>
        {tags.map((t) => (
          <span className="ht-chip" key={t}>
            {t}
            {!disabled && (
              <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={tags.length ? '' : 'Type a hashtag…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
        />
      </div>

      {focused && typing && list.length > 0 && (
        <ul className="ht-menu" role="listbox">
          {list.map((s, i) => (
            <li
              key={s.tag}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.tag);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="ht-tag">{s.tag}</span>
              <span className={`ht-src ${s.source}`}>{s.note ?? SOURCE_LABEL[s.source]}</span>
            </li>
          ))}
        </ul>
      )}

      {!disabled && !typing && (
        <div className="ht-suggest">
          <div className="ht-suggest-head">Suggested {loading && <span>· updating…</span>}</div>
          <div className="ht-pills">
            {available.map((s) => (
              <button type="button" key={s.tag} className={`ht-pill ${s.source}`} title={s.note ?? SOURCE_LABEL[s.source]} onClick={() => add(s.tag)}>
                + {s.tag}
                <small>{s.note ?? SOURCE_LABEL[s.source]}</small>
              </button>
            ))}
            {!loading && available.length === 0 && <span className="ht-empty">No more suggestions.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
