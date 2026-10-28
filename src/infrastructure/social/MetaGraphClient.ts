import type { SocialPublisher, PublishResult } from '@/application/services/SocialPublisher';
import type { Platform } from '@/domain/entities/Post';
import type { MetaTokenStore } from './MetaTokenStore';
import { cleanPath, publicBaseUrl } from '@/infrastructure/config/publicUrl';
import { prepareForFacebook, prepareForInstagram } from './InstagramImage';

const CONTAINER_POLL_MS = 3_000;
const CONTAINER_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The one non-open-source dependency in this stack: Facebook/Instagram only
 * accept posts through Meta's own closed Graph API. Everything else here
 * (DB, queue, renderer, translation) is open source; this adapter is the
 * single, isolated place that talks to Meta, so swapping or mocking it never
 * touches the rest of the app.
 *
 * Setup required before this works:
 *  1. Create a Facebook App at developers.facebook.com
 *  2. Generate a long-lived Page access token for your Facebook Page
 *  3. Link an Instagram Business/Creator account to that Page in
 *     Meta Business Suite
 *  4. Fill in META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_IG_USER_ID in .env
 */
export class MetaGraphClient implements SocialPublisher {
  private readonly apiVersion: string;
  private readonly pageId: string;
  private readonly igUserId: string;

  constructor(
    private readonly tokens: MetaTokenStore,
    env: NodeJS.ProcessEnv = process.env
  ) {
    this.apiVersion = env.META_GRAPH_API_VERSION ?? 'v21.0';
    this.pageId = this.require(env, 'META_PAGE_ID');
    this.igUserId = this.require(env, 'META_IG_USER_ID');
  }

  private require(env: NodeJS.ProcessEnv, key: string): string {
    const val = env[key];
    if (!val) {
      throw new Error(
        `Missing ${key} — Meta Graph API publishing needs this set in .env. ` +
          'See infrastructure/social/MetaGraphClient.ts for setup steps.'
      );
    }
    return val;
  }

  private get baseUrl() {
    return `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Image URLs are stored absolute, with whatever PUBLIC_BASE_URL was when they were made
   * (often http://localhost:3000). Meta must fetch them from the internet, so always serve
   * our own /generated and /uploads files from the current public address.
   */
  private toPublicUrl(imageUrl: string): string {
    const base = process.env.PUBLIC_BASE_URL ? publicBaseUrl() : '';
    try {
      const u = new URL(imageUrl);
      const pathname = cleanPath(u.pathname); // stored URLs may contain "//generated/..."
      if (base && /^\/(generated|uploads)\//.test(pathname)) return `${base}${pathname}${u.search}`;
    } catch {
      /* not a URL we can rewrite: use as is */
    }
    return imageUrl;
  }

  async publish(args: { platform: Platform; imageUrl: string; text: string }): Promise<PublishResult> {
    args = { ...args, imageUrl: this.toPublicUrl(args.imageUrl) };
    return args.platform === 'FACEBOOK'
      ? this.publishToFacebookPage(args.imageUrl, args.text)
      : this.publishToInstagram(args.imageUrl, args.text);
  }

  private async publishToFacebookPage(imageUrl: string, caption: string): Promise<PublishResult> {
    imageUrl = await prepareForFacebook(imageUrl);
    const res = await fetch(`${this.baseUrl}/${this.pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        caption,
        access_token: await this.tokens.get()
      })
    });
    const data = await this.parse(res);
    return { platformPostId: data.post_id ?? data.id };
  }

  private async publishToInstagram(imageUrl: string, caption: string): Promise<PublishResult> {
    // Instagram's Graph API is a two-step container flow: create a media
    // container, wait until Meta has processed it, then publish it.
    imageUrl = await prepareForInstagram(imageUrl);
    const createRes = await fetch(`${this.baseUrl}/${this.igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: await this.tokens.get()
      })
    });
    const created = await this.parse(createRes);
    await this.waitForContainer(created.id);

    const publishRes = await fetch(`${this.baseUrl}/${this.igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: created.id,
        access_token: await this.tokens.get()
      })
    });
    const published = await this.parse(publishRes);
    return { platformPostId: published.id };
  }

  /** media_publish fails while the container is still IN_PROGRESS, so poll until it is FINISHED. */
  private async waitForContainer(containerId: string): Promise<void> {
    const deadline = Date.now() + CONTAINER_TIMEOUT_MS;
    for (;;) {
      const res = await fetch(`${this.baseUrl}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(await this.tokens.get())}`);
      const data = await this.parse(res);
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Instagram rejected the image (${data.status_code}${data.status ? `: ${data.status}` : ''}).`);
      }
      if (Date.now() > deadline) throw new Error('Instagram did not finish processing the image in time.');
      await sleep(CONTAINER_POLL_MS);
    }
  }

  /** Verifies the token still works and can see the Page and the Instagram account. Null = healthy. */
  async checkHealth(): Promise<string | null> {
    try {
      const token = encodeURIComponent(await this.tokens.get());
      // Reading works with a user token too, but Facebook only lets a *Page* token publish to the Page.
      const me = await this.parse(await fetch(`${this.baseUrl}/me?fields=id&access_token=${token}`));
      if (me.id !== this.pageId) {
        return 'The token is a user token, not the Page token, so Facebook posting will fail (#200). Run `npm run meta:connect -- <token>` to convert it.';
      }
      const page = await fetch(`${this.baseUrl}/${this.pageId}?fields=id&access_token=${token}`);
      await this.parse(page);
      const ig = await fetch(`${this.baseUrl}/${this.igUserId}?fields=id&access_token=${token}`);
      await this.parse(ig);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private async parse(res: Response): Promise<any> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error;
      const message = e?.message ?? `Graph API request failed (${res.status})`;
      // Code 190 = the token is expired or revoked; retrying cannot help until it is replaced.
      throw new Error(e?.code === 190 ? `Meta access token is invalid or expired — generate a new one. (${message})` : message);
    }
    return json;
  }
}
