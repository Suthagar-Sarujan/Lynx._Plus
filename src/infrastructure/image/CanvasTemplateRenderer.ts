import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D as CanvasRenderingContext2D } from '@napi-rs/canvas';
import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { loadImageBuffer } from './loadImageBuffer';
import { publicBaseUrl } from '@/infrastructure/config/publicUrl';
import type { TemplateRenderer, RenderTemplateInput } from '@/application/services/TemplateRenderer';
import { BODY_SIZE, type BodyFontKey, type BodyStyle } from '@/domain/entities/BodyStyle';

// The LYNX._PLUS template is fixed: only the photo, the date and the news text
// change from post to post. Everything else below is the template itself,
// laid out on the 1500x2000 reference design.
// Saved posts are drawn at RENDER_SCALE x the reference size: 1.92 gives 2880x3840, i.e. 4K on the long side.
// Layout is unchanged (the canvas is simply scaled), so every coordinate below stays in reference units.
const OUTPUT_SCALE = Number(process.env.RENDER_SCALE ?? 1.92);
const WIDTH = 1500;
const HEIGHT = 2000;
const PHOTO_HEIGHT = 1665; // photo fades into the dark panel below this line
const GOLD = '#cf9335';
const WHITE = '#ffffff';
const PANEL_TOP = '#291414';
const PANEL_BOTTOM = '#1a0505';
const FADE = '26,5,5';

const BADGE_WORD = 'NEWS';
const HEADLINE_SKEW = 0.22; // lean of the BREAKING NEWS letters (tangent of the slant angle)
const CREDIT_TAG = ': LYNX._CINE';

const BODY_LEFT = 90;
const BODY_WIDTH = 1320;
const BODY_TOP = 1262;
const BODY_BOTTOM = 1650;

const ASSETS_DIR = path.join(process.cwd(), 'assets');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'generated');

// Registered once per process from /fonts (all SIL Open Font License, from
// Google Fonts). Uses `@napi-rs/canvas` (MIT, prebuilt binaries — no node-gyp
// toolchain needed).
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), 'fonts');
  const register = (file: string, family: string) => {
    try {
      GlobalFonts.registerFromPath(path.join(fontsDir, file), family);
    } catch {
      // Font file missing — falls back to a system font.
    }
  };
  register('Anton-Regular.ttf', 'Anton');
  register('Poppins-Regular.ttf', 'Poppins');
  register('Poppins-SemiBold.ttf', 'Poppins SemiBold');
  register('OpenSans.ttf', 'Open Sans');
  register('Inter.ttf', 'Inter');
  register('Oswald.ttf', 'Oswald');
  register('PlayfairDisplay.ttf', 'Playfair Display');
  register('Lora.ttf', 'Lora');
  register('NotoSansSinhala.ttf', 'Noto Sans Sinhala');
  register('NotoSansTamil.ttf', 'Noto Sans Tamil');
  fontsRegistered = true;
}

interface BodyFont {
  regular: (size: number) => string;
  highlight: (size: number) => string;
  fauxBold: boolean; // the highlight face has no bold file: thicken it by stroking
  lineHeight: number; // multiple of font size
}

// Families for the user-selectable body fonts. Only Poppins ships a semi-bold file;
// the rest get their gold highlights thickened by a thin stroke.
const FONT_FAMILIES: Record<BodyFontKey, { family: string; semibold?: string; lineHeight: number }> = {
  poppins: { family: 'Poppins', semibold: 'Poppins SemiBold', lineHeight: 1.2 },
  opensans: { family: 'Open Sans', lineHeight: 1.22 },
  inter: { family: 'Inter', lineHeight: 1.22 },
  oswald: { family: 'Oswald', lineHeight: 1.2 },
  playfair: { family: 'Playfair Display', lineHeight: 1.22 },
  lora: { family: 'Lora', lineHeight: 1.22 }
};

function bodyFont(language: string, key: BodyFontKey | null | undefined): BodyFont {
  // Sinhala and Tamil always use their own Noto fonts: the Latin fonts have no glyphs for them.
  if (language === 'si' || language === 'ta') {
    const family = language === 'si' ? 'Noto Sans Sinhala' : 'Noto Sans Tamil';
    const f = (s: number) => `${s}px "${family}"`;
    return { regular: f, highlight: f, fauxBold: true, lineHeight: 1.6 };
  }
  const font = FONT_FAMILIES[key ?? 'poppins'];
  return {
    regular: (s) => `${s}px "${font.family}"`,
    highlight: (s) => `${s}px "${font.semibold ?? font.family}"`,
    fauxBold: !font.semibold,
    lineHeight: font.lineHeight
  };
}

interface Run {
  text: string;
  gold: boolean;
}

/** Splits "plain **gold** plain" into alternating normal/highlighted runs. */
function splitHighlights(text: string): Run[] {
  const parts: Run[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), gold: false });
    parts.push({ text: match[1] ?? '', gold: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), gold: false });
  return parts;
}

/** Word-wraps mixed normal/gold runs onto lines that fit maxWidth (each word measured in its own weight). */
function wrapRuns(ctx: CanvasRenderingContext2D, runs: Run[], maxWidth: number, font: BodyFont, size: number): Run[][] {
  const words: Run[] = [];
  for (const run of runs) {
    for (const word of run.text.split(/(\s+)/).filter(Boolean)) words.push({ text: word, gold: run.gold });
  }
  const width = (w: Run) => {
    ctx.font = w.gold ? font.highlight(size) : font.regular(size);
    return ctx.measureText(w.text).width;
  };

  const lines: Run[][] = [[]];
  let lineWidth = 0;
  for (const word of words) {
    const w = width(word);
    const current = lines[lines.length - 1]!;
    if (/^\s+$/.test(word.text) && current.length === 0) continue; // no leading spaces on wrapped lines
    if (lineWidth + w > maxWidth && current.length > 0) {
      lines.push([]);
      lineWidth = 0;
      if (/^\s+$/.test(word.text)) continue;
    }
    lines[lines.length - 1]!.push(word);
    lineWidth += w;
  }
  return lines.map((l) => {
    while (l.length && /^\s+$/.test(l[l.length - 1]!.text)) l.pop(); // no trailing spaces (keeps centering exact)
    return l;
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export class CanvasTemplateRenderer implements TemplateRenderer {
  async render(input: RenderTemplateInput): Promise<{ filePath: string; url: string }> {
    // Saved posts are high-quality JPEG: a 4K PNG of a photo is 4-7 MB, the JPEG about a quarter of that.
    const jpeg = await this.renderToBuffer(input, OUTPUT_SCALE, 'jpeg');

    await mkdir(OUTPUT_DIR, { recursive: true });
    const filename = `post-${randomUUID()}.jpg`;
    const filePath = path.join(OUTPUT_DIR, filename);
    await writeFile(filePath, jpeg);

    return { filePath, url: `${publicBaseUrl()}/generated/${filename}` };
  }

  /** The finished image in memory. PNG by default (live previews, scale 1, nothing is written to disk). */
  async renderToBuffer(input: RenderTemplateInput, scale = 1, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> {
    ensureFonts();

    const canvas = createCanvas(Math.round(WIDTH * scale), Math.round(HEIGHT * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    this.drawBackground(ctx, await loadImage(await this.preparePhoto(input.photoPath, scale)));
    await this.drawLogo(ctx);
    await this.drawWatermark(ctx);
    this.drawDate(ctx, input.dateLabel, input.yearLabel);
    this.drawHeadline(ctx, input.showBreaking ?? false, input.showNews ?? true);
    this.drawBody(ctx, input.bodyText, input.language, input.bodyStyle ?? {});
    this.drawSocialIcons(ctx);
    this.drawCreditPill(ctx);

    return format === 'jpeg' ? canvas.toBuffer('image/jpeg', 95) : canvas.toBuffer('image/png');
  }

  /**
   * For full-size renders, scales the photo to exactly the pixels it will occupy (Lanczos, in steps of at
   * most 2x, which stays smoother than one big jump) and sharpens lightly. This cannot invent detail that a
   * small source never had, but it avoids the extra softness of letting the canvas stretch it.
   */
  private async preparePhoto(photoPath: string, scale: number): Promise<Buffer> {
    const original = await loadImageBuffer(photoPath);
    if (scale <= 1) return original;

    const targetW = Math.round(WIDTH * scale);
    const targetH = Math.round(PHOTO_HEIGHT * scale);
    const { width = 0, height = 0 } = await sharp(original).metadata();
    if (!width || !height) return original;

    // Crop to the template's photo box first (same cover-fit the canvas would do), then enlarge.
    const boxRatio = targetW / targetH;
    const cropW = Math.min(width, Math.round(height * boxRatio));
    const cropH = Math.min(height, Math.round(width / boxRatio));
    let img = await sharp(original)
      .rotate()
      .extract({ left: Math.floor((width - cropW) / 2), top: Math.floor((height - cropH) / 2), width: cropW, height: cropH })
      .toBuffer();

    let w = cropW;
    while (w < targetW) {
      w = Math.min(targetW, w * 2);
      img = await sharp(img).resize({ width: w, kernel: 'lanczos3' }).toBuffer();
    }
    const upscale = targetW / cropW;
    return sharp(img)
      .resize({ width: targetW, height: targetH, fit: 'cover', kernel: 'lanczos3' })
      .sharpen({ sigma: 0.8 + Math.min(upscale, 4) * 0.25, m1: 0.6, m2: 1.6 })
      .png()
      .toBuffer();
  }

  /** Photo on top (cover-fit), fading into the solid dark panel at the bottom. */
  private drawBackground(ctx: CanvasRenderingContext2D, photo: any) {
    const panel = ctx.createLinearGradient(0, PHOTO_HEIGHT, 0, HEIGHT);
    panel.addColorStop(0, PANEL_TOP);
    panel.addColorStop(0.7, PANEL_BOTTOM);
    ctx.fillStyle = panel;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    this.drawCover(ctx, photo, 0, 0, WIDTH, PHOTO_HEIGHT);

    // Soft shade at the top so the logo and date stay readable on bright photos.
    const top = ctx.createLinearGradient(0, 0, 0, 380);
    top.addColorStop(0, 'rgba(0,0,0,0.65)');
    top.addColorStop(0.55, 'rgba(0,0,0,0.3)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, WIDTH, 380);

    // Fade the lower photo into the panel so the text sits on a dark base.
    const fade = ctx.createLinearGradient(0, 1000, 0, PHOTO_HEIGHT);
    fade.addColorStop(0, `rgba(${FADE},0)`);
    fade.addColorStop(0.45, `rgba(${FADE},0.55)`);
    fade.addColorStop(1, `rgba(${FADE},0.93)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 1000, WIDTH, PHOTO_HEIGHT - 1000);
  }

  /** Uses assets/logo.png when present; otherwise a gold text wordmark. */
  private async drawLogo(ctx: CanvasRenderingContext2D) {
    const file = path.join(ASSETS_DIR, 'logo.png');
    if (await exists(file)) {
      const logo = await loadImage(file);
      // Round emblem with a gold ring, same height as the date panel on the right.
      const D = 160;
      const cx = 78 + D / 2;
      const cy = 56 + D / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
      ctx.fillStyle = PANEL_BOTTOM;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2 - 3, 0, Math.PI * 2);
      ctx.clip();
      this.drawCover(ctx, logo, cx - D / 2, cy - D / 2, D, D);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = '84px "Anton"';
    const grad = ctx.createLinearGradient(0, 80, 0, 170);
    grad.addColorStop(0, '#e8b34f');
    grad.addColorStop(1, '#b9791f');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText('LYNX._PLUS', 80, 168);
    ctx.restore();
  }

  /** Faint lynx mark, bottom-left. Only drawn when assets/watermark.png exists. */
  private async drawWatermark(ctx: CanvasRenderingContext2D) {
    const file = path.join(ASSETS_DIR, 'watermark.png');
    if (!(await exists(file))) return;
    const mark = await loadImage(file);
    const h = 440;
    const w = (mark.width / mark.height) * h;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(mark, 0, HEIGHT - h - 10, w, h);
    ctx.restore();
  }

  /** Dark rounded panel: gold square with the day, then the month (bold) over the year. */
  private drawDate(ctx: CanvasRenderingContext2D, dateLabel: string, yearLabel: string) {
    // Labels are "Month D"; anything else falls back to the whole label in the month slot.
    const m = /^(.*?)\s+(\d{1,2})$/.exec(dateLabel.trim());
    const day = m ? m[2]! : '';
    const month = m ? m[1]! : dateLabel;

    const RIGHT = 1422;
    const TOP = 56;
    const PAD = 28;
    const SQUARE = 104;
    const GAP = 30;
    const H = SQUARE + PAD * 2;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '50px "Poppins SemiBold"';
    const monthW = ctx.measureText(month).width;
    ctx.font = '40px "Poppins"';
    const yearW = ctx.measureText(yearLabel).width;
    const textW = Math.max(monthW, yearW);
    const W = PAD + (day ? SQUARE + GAP : 0) + textW + PAD + 8;
    const left = RIGHT - W;

    // Panel
    ctx.fillStyle = 'rgba(38,20,20,0.92)';
    this.roundRect(ctx, left, TOP, W, H, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Day square
    let x = left + PAD;
    if (day) {
      ctx.fillStyle = GOLD;
      this.roundRect(ctx, x, TOP + PAD, SQUARE, SQUARE, 22);
      ctx.fill();
      ctx.fillStyle = PANEL_BOTTOM;
      ctx.textAlign = 'center';
      ctx.font = '62px "Poppins SemiBold"';
      ctx.fillText(day, x + SQUARE / 2, TOP + PAD + SQUARE / 2 + 3);
      x += SQUARE + GAP;
    }

    // Month over year
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f6e7cc';
    ctx.font = '50px "Poppins SemiBold"';
    ctx.fillText(month, x, TOP + H / 2 - 24);
    ctx.fillStyle = '#b9a98f';
    ctx.font = '40px "Poppins"';
    ctx.fillText(yearLabel, x, TOP + H / 2 + 28);
    ctx.restore();
  }

  /**
   * "BREAKING" + gold "NEWS" box, placed exactly as in the reference design.
   * Anton (no outline) slanted ~12.4°; size, tracking and positions were fitted to the
   * reference's pixels (95% overlap on BREAKING, 93% on NEWS).
   * "NEWS" is always shown, centred. "BREAKING NEWS" appears only when the post is marked
   * as breaking (BREAKING is never shown without NEWS).
   */
  private drawHeadline(ctx: CanvasRenderingContext2D, showBreaking: boolean, showNews: boolean) {
    const BREAKING = { x: 254, baseline: 1188, size: 183, tracking: 1 };
    const NEWS_BOX = { x: 974, y: 1088, w: 229, h: 104 };
    const NEWS_TEXT_DX = 10; // text sits this far inside the gold box

    const breaking = showBreaking && showNews;
    const boxX = breaking ? NEWS_BOX.x : (WIDTH - NEWS_BOX.w) / 2;

    ctx.fillStyle = GOLD;
    ctx.fillRect(boxX, NEWS_BOX.y, NEWS_BOX.w, NEWS_BOX.h);
    this.drawItalic(ctx, BADGE_WORD, { x: boxX + NEWS_TEXT_DX, baseline: 1176, size: 94, tracking: 0 });
    if (breaking) {
      this.drawItalic(ctx, 'BREAKING', BREAKING);
    }
  }

  private italicWidth(ctx: CanvasRenderingContext2D, text: string, at: { size: number; tracking: number }): number {
    ctx.save();
    ctx.font = `${at.size}px "Anton"`;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + at.tracking;
    ctx.restore();
    return w - at.tracking;
  }

  /** White Anton text slanted to the right around its baseline, letter by letter so tracking can be applied. */
  private drawItalic(
    ctx: CanvasRenderingContext2D,
    text: string,
    at: { x: number; baseline: number; size: number; tracking: number }
  ) {
    ctx.save();
    ctx.font = `${at.size}px "Anton"`;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(at.x, at.baseline); // skew about the baseline so the text doesn't drift sideways
    ctx.transform(1, 0, -HEADLINE_SKEW, 1, 0, 0);
    let x = 0;
    for (const ch of text) {
      ctx.fillText(ch, x, 0);
      x += ctx.measureText(ch).width + at.tracking;
    }
    ctx.restore();
  }

  /** Centred body text; shrinks to fit so long stories never run into the icons. */
  private drawBody(ctx: CanvasRenderingContext2D, text: string, language: string, style: BodyStyle) {
    const font = bodyFont(language, style.font);
    const runs = splitHighlights(text);
    const spacing = style.lineHeight ? style.lineHeight / 100 : font.lineHeight;
    const align = style.align ?? 'center';

    // The chosen size is a maximum: long text still steps down so it never reaches the icons.
    let size = style.size ?? BODY_SIZE.auto;
    let lines = wrapRuns(ctx, runs, BODY_WIDTH, font, size);
    while (size > BODY_SIZE.min && BODY_TOP + lines.length * size * spacing > BODY_BOTTOM) {
      size -= 2;
      lines = wrapRuns(ctx, runs, BODY_WIDTH, font, size);
    }

    const lineHeight = size * spacing;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const widths = line.map((w) => {
        ctx.font = w.gold ? font.highlight(size) : font.regular(size);
        return ctx.measureText(w.text).width;
      });
      const free = BODY_WIDTH - widths.reduce((a, b) => a + b, 0);
      let x = BODY_LEFT + (align === 'center' ? free / 2 : align === 'right' ? free : 0);
      const y = BODY_TOP + lineHeight / 2 + i * lineHeight;
      line.forEach((w, j) => {
        ctx.font = w.gold ? font.highlight(size) : font.regular(size);
        ctx.fillStyle = w.gold ? GOLD : WHITE;
        if (w.gold && font.fauxBold) {
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = size * 0.03;
          ctx.lineJoin = 'round';
          ctx.strokeText(w.text, x, y);
        }
        ctx.fillText(w.text, x, y);
        x += widths[j]!;
      });
    });
    ctx.restore();
  }

  /** Instagram + Facebook marks, drawn as vectors, centred under the body. */
  private drawSocialIcons(ctx: CanvasRenderingContext2D) {
    const cy = 1752;
    const size = 62;

    // Instagram
    const ix = 723 - size / 2;
    const iy = cy - size / 2;
    const grad = ctx.createLinearGradient(ix, iy + size, ix + size, iy);
    grad.addColorStop(0, '#fdc468');
    grad.addColorStop(0.35, '#e1306c');
    grad.addColorStop(0.7, '#c13584');
    grad.addColorStop(1, '#5851db');
    ctx.save();
    ctx.fillStyle = grad;
    this.roundRect(ctx, ix, iy, size, size, 17);
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 4.5;
    this.roundRect(ctx, ix + 10, iy + 10, size - 20, size - 20, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(723, cy, 11.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(ix + size - 17, iy + 17, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Facebook
    const fx = 819;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1877f2';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = WHITE;
    ctx.font = 'bold 78px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('f', fx + 5, cy + size / 2 + 6);
    ctx.restore();
  }

  /** Gold outlined pill, bottom-right. */
  private drawCreditPill(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = 'bold 31px Arial';
    const w = Math.max(348, ctx.measureText(CREDIT_TAG).width + 64);
    const h = 42;
    const x = WIDTH - 40 - w;
    const y = 1914;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3.5;
    this.roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CREDIT_TAG, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  private drawCover(ctx: CanvasRenderingContext2D, img: any, x: number, y: number, w: number, h: number) {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgRatio > boxRatio) {
      sw = img.height * boxRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / boxRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
