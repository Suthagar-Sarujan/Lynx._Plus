'use client';

import {
  BODY_ALIGNS,
  BODY_FONT_KEYS,
  BODY_FONTS,
  BODY_LINE_HEIGHT,
  BODY_SIZE,
  type BodyAlign,
  type BodyFontKey
} from '@/domain/entities/BodyStyle';
import { Dropdown } from 'primereact/dropdown';
import { Slider } from 'primereact/slider';
import { Checkbox } from 'primereact/checkbox';
import { SelectButton } from 'primereact/selectbutton';
import { Button } from 'primereact/button';

/** Typesetting of the news text. size/lineHeight null = automatic. */
export interface TextStyle {
  font: BodyFontKey;
  size: number | null;
  align: BodyAlign;
  lineHeight: number | null;
}

export const DEFAULT_TEXT_STYLE: TextStyle = { font: 'poppins', size: null, align: 'center', lineHeight: null };

interface StoredStyle {
  bodyFont?: string | null;
  bodyFontSize?: number | null;
  bodyAlign?: string | null;
  bodyLineHeight?: number | null;
}

export function styleFromPost(post: StoredStyle): TextStyle {
  return {
    font: BODY_FONT_KEYS.find((k) => k === post.bodyFont) ?? DEFAULT_TEXT_STYLE.font,
    size: post.bodyFontSize ?? null,
    align: BODY_ALIGNS.find((a) => a === post.bodyAlign) ?? DEFAULT_TEXT_STYLE.align,
    lineHeight: post.bodyLineHeight ?? null
  };
}

/** The fields the API stores / the preview endpoint takes. */
export function styleToPayload(style: TextStyle) {
  return { bodyFont: style.font, bodyFontSize: style.size, bodyAlign: style.align, bodyLineHeight: style.lineHeight };
}

const ALIGN_LABEL: Record<BodyAlign, string> = { left: 'Left', center: 'Center', right: 'Right' };
const ALIGN_ICON: Record<BodyAlign, string> = { left: 'pi pi-align-left', center: 'pi pi-align-center', right: 'pi pi-align-right' };

/** Font, size, alignment and line spacing for the news text. */
export function TextStyleControls({
  value,
  onChange,
  disabled
}: {
  value: TextStyle;
  onChange: (next: TextStyle) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<TextStyle>) => onChange({ ...value, ...patch });
  const isDefault =
    value.font === DEFAULT_TEXT_STYLE.font && value.size === null && value.align === DEFAULT_TEXT_STYLE.align && value.lineHeight === null;

  return (
    <fieldset className="style-box" disabled={disabled}>
      <legend>Text style</legend>

      <div className="field">
        <label>Font</label>
        <Dropdown
          value={value.font}
          options={BODY_FONTS.map((f) => ({ label: f.label, value: f.key }))}
          onChange={(e) => set({ font: e.value as BodyFontKey })}
          disabled={disabled}
        />
      </div>

      <div className={`field ${value.size === null ? 'is-auto' : ''}`} aria-disabled={value.size === null || undefined}>
        <label>
          Size {value.size === null ? '· Auto' : `· ${value.size}px`}
          <span className="style-auto">
            <Checkbox inputId="size-auto" checked={value.size === null} disabled={disabled} onChange={(e) => set({ size: e.checked ? null : BODY_SIZE.auto })} />
            <label htmlFor="size-auto">Auto</label>
          </span>
        </label>
        <Slider
          min={BODY_SIZE.min}
          max={BODY_SIZE.max}
          value={value.size ?? BODY_SIZE.auto}
          disabled={disabled || value.size === null}
          onChange={(e) => set({ size: Number(e.value) })}
        />
        <div className="style-hint">Long text still shrinks to fit above the social icons.</div>
      </div>

      <div className="field">
        <label>Alignment</label>
        <SelectButton
          value={value.align}
          options={BODY_ALIGNS.map((a) => ({ label: ALIGN_LABEL[a], value: a, icon: ALIGN_ICON[a] }))}
          itemTemplate={(o: { label: string; icon: string }) => <i className={o.icon} title={o.label} />}
          onChange={(e) => e.value && set({ align: e.value as BodyAlign })}
          allowEmpty={false}
          disabled={disabled}
        />
      </div>

      <div className={`field ${value.lineHeight === null ? 'is-auto' : ''}`} aria-disabled={value.lineHeight === null || undefined}>
        <label>
          Line spacing {value.lineHeight === null ? '· Auto' : `· ${value.lineHeight}%`}
          <span className="style-auto">
            <Checkbox inputId="lh-auto" checked={value.lineHeight === null} disabled={disabled} onChange={(e) => set({ lineHeight: e.checked ? null : 125 })} />
            <label htmlFor="lh-auto">Auto</label>
          </span>
        </label>
        <Slider
          min={BODY_LINE_HEIGHT.min}
          max={BODY_LINE_HEIGHT.max}
          value={value.lineHeight ?? 125}
          disabled={disabled || value.lineHeight === null}
          onChange={(e) => set({ lineHeight: Number(e.value) })}
        />
      </div>

      <Button type="button" label="Reset text style" icon="pi pi-undo" outlined size="small" disabled={disabled || isDefault} onClick={() => onChange(DEFAULT_TEXT_STYLE)} style={{ width: 'fit-content' }} />
    </fieldset>
  );
}
