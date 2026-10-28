'use client';

import { useEffect, useState } from 'react';
import { fromDateInput } from './dateLabels';
import { styleToPayload, type TextStyle } from './TextStyleControls';

/**
 * Re-renders the real template (same renderer as the final image) shortly after
 * the photo, date or text changes, so the user sees the finished post before saving.
 */
export function useLivePreview({
  enabled,
  photo,
  bodyText,
  date,
  language,
  style,
  showBreaking = false,
  showNews = true
}: {
  enabled: boolean;
  photo: string;
  bodyText: string;
  date: string;
  language: string;
  style: TextStyle;
  showBreaking?: boolean;
  showNews?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !photo || !bodyText.trim() || !date) {
      setRendering(false); // an aborted request must not leave "Updating…" stuck on
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setRendering(true);
      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl: photo, bodyText, language, showBreaking, showNews, ...fromDateInput(date), ...styleToPayload(style) }),
          signal: ctrl.signal
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Preview failed');
        const url = URL.createObjectURL(await res.blob());
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setError(null);
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (!ctrl.signal.aborted) setRendering(false);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [enabled, photo, bodyText, date, language, style.font, style.size, style.align, style.lineHeight, showBreaking, showNews]);

  // Free the last image when the component goes away.
  useEffect(
    () => () =>
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      }),
    []
  );

  return { preview, rendering, error };
}
