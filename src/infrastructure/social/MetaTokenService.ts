import type { MetaTokenStore } from './MetaTokenStore';

export interface ConnectResult {
  pageId: string;
  pageName: string;
  /** How the token was obtained, for the operator's log. */
  via: 'exchanged-user-token' | 'page-from-user-token' | 'page-token-as-is';
}

/**
 * Turns whatever token you can get quickly (e.g. a 1-hour Graph API Explorer user token) into the
 * permanent Page token and stores it:
 *   user token --(app id + secret)--> long-lived user token (~60 days)
 *              --(/me/accounts)-----> Page token, which does not expire
 * A token that already is the Page's own token is stored unchanged.
 * Needs META_APP_ID and META_APP_SECRET (the app secret never leaves the server).
 */
export class MetaTokenService {
  constructor(
    private readonly store: MetaTokenStore,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  private get base() {
    return `https://graph.facebook.com/${this.env.META_GRAPH_API_VERSION ?? 'v21.0'}`;
  }

  private async graph(path: string, params: Record<string, string>): Promise<any> {
    const res = await fetch(`${this.base}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20_000) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json?.error?.message ?? `Graph API request failed (${res.status})`);
    return json;
  }

  async connect(inputToken: string): Promise<ConnectResult> {
    const token = inputToken.trim();
    const pageId = this.env.META_PAGE_ID;
    if (!token) throw new Error('No token given.');
    if (!pageId) throw new Error('META_PAGE_ID is not set in .env.');

    const me = await this.graph('me', { fields: 'id,name', access_token: token });
    let pageToken = token;
    let via: ConnectResult['via'] = 'page-token-as-is';
    let pageName = me.name as string;

    if (me.id !== pageId) {
      const appId = this.env.META_APP_ID;
      const appSecret = this.env.META_APP_SECRET;

      // With the app id + secret the user token is first extended to ~60 days, so the Page token never expires.
      // Without them the Page token is taken from the user token as it is, and lasts only as long as that token does.
      let userToken = token;
      if (appId && appSecret) {
        const long = await this.graph('oauth/access_token', {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: token
        });
        userToken = long.access_token;
      }
      const accounts = await this.graph('me/accounts', { fields: 'id,name,access_token', access_token: userToken });
      const page = (accounts.data ?? []).find((p: any) => p.id === pageId);
      if (!page?.access_token) {
        throw new Error(`That login has no access to Page ${pageId}. Pages it can manage: ${(accounts.data ?? []).map((p: any) => p.name).join(', ') || 'none'}.`);
      }
      pageToken = page.access_token;
      pageName = page.name;
      via = appId && appSecret ? 'exchanged-user-token' : 'page-from-user-token';
    }

    // Prove it works before replacing the stored one.
    const check = await this.graph('me', { fields: 'id', access_token: pageToken });
    if (check.id !== pageId) throw new Error('The resulting token does not act as the configured Page.');

    await this.store.set(pageToken);
    return { pageId, pageName, via };
  }
}
