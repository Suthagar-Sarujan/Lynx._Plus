'use client';

import { InputSwitch } from 'primereact/inputswitch';

export interface HeadlineShow {
  showBreaking: boolean;
  showNews: boolean;
}

/**
 * Two switches. News is on by default, Breaking is off by default.
 *   News on + Breaking on  -> the image says "BREAKING NEWS"
 *   anything else          -> the image says "NEWS"
 * Breaking only makes sense together with News, so it is disabled while News is off.
 */
export function HeadlineToggles({ value, onChange, disabled }: { value: HeadlineShow; onChange: (next: HeadlineShow) => void; disabled?: boolean }) {
  return (
    <fieldset className="style-box headline-toggles" disabled={disabled}>
      <legend>Headline on image</legend>
      <div className="toggle-row">
        <label htmlFor="show-news">News</label>
        <InputSwitch
          inputId="show-news"
          checked={value.showNews}
          disabled={disabled}
          // Switching News off also clears Breaking, so it cannot be "on" while hidden.
          onChange={(e) => onChange({ showNews: !!e.value, showBreaking: e.value ? value.showBreaking : false })}
        />
      </div>
      <div className="toggle-row">
        <label htmlFor="show-breaking">Breaking</label>
        <InputSwitch
          inputId="show-breaking"
          checked={value.showBreaking && value.showNews}
          disabled={disabled || !value.showNews}
          onChange={(e) => onChange({ ...value, showBreaking: !!e.value })}
        />
      </div>
      <div className="style-hint">News + Breaking on: &quot;BREAKING NEWS&quot;. Otherwise: &quot;NEWS&quot;.</div>
    </fieldset>
  );
}
