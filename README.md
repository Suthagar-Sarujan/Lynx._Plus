# LYNX._NEWS

A multi-language, multi-category news publishing dashboard: draft a story,
render it into the Lynx Plus template, translate it into Sinhala/Tamil/Hindi
(or any language), and publish or schedule it to Facebook and Instagram.

Built on a fully open-source stack, with one unavoidable exception: posting
to Facebook/Instagram has to go through Meta's own closed Graph API — there
is no open-source way around that, since Meta controls those platforms.
Everything else — the app, database, queue, image renderer, translation
engine, hosting — is open source and self-hostable.

## Stack

| Layer | Technology | License |
|---|---|---|
| App framework | Next.js 14 (App Router) + TypeScript | MIT |
| Database | MySQL 8 | GPL |
| ORM | Prisma | Apache 2.0 |
| Scheduled publishing | BullMQ + Redis | MIT / BSD |
| Template image rendering | @napi-rs/canvas | MIT |
| Translation | LibreTranslate (self-hosted) | AGPL |
| Deployment | Docker / docker-compose | Apache 2.0 |
| Facebook + Instagram publishing | Meta Graph API | **Proprietary — unavoidable** |

## Architecture

This follows clean architecture: dependencies point inward, and nothing in
`domain` or `application` imports a framework, Prisma, or an HTTP library.

```
src/
  domain/              # Entities + repository interfaces. Zero dependencies.
    entities/          #   Post, Story — business rules (status transitions, etc).
    repositories/       #   PostRepository, StoryRepository — interfaces only.

  application/         # Use cases that orchestrate domain + ports. Still no
                        # framework/DB/HTTP imports — only interfaces.
    use-cases/          #   CreatePost, SchedulePost, PublishPostNow, TranslatePost, ...
    services/           #   Ports: SocialPublisher, TranslationService, TemplateRenderer, PublishQueue
    dto/                #   Zod-validated input shapes

  infrastructure/       # Concrete adapters implementing the ports above.
    db/                 #   Prisma client singleton
    repositories/       #   PrismaPostRepository, PrismaStoryRepository
    social/              #   MetaGraphClient (Facebook + Instagram)
    translation/          #   LibreTranslateService
    image/               #   CanvasTemplateRenderer (@napi-rs/canvas)
    queue/               #   BullMqPublishQueue + worker.ts (the scheduled-job runner)
    container.ts          #   Composition root — the ONLY file wiring infra into use cases

  app/                  # Presentation layer: Next.js routes + the dashboard UI.
    api/                 #   Thin controllers — parse request, call a use case, return JSON.
    page.tsx              #   The dashboard (Home / Analytics / News / Upload).
```

Why this shape: every outward-facing dependency (MySQL, Meta's API,
LibreTranslate, BullMQ) is hidden behind an interface the application layer
defines. Swapping MySQL for Postgres, or Meta's API for a mock in tests,
means writing one new adapter — nothing in `domain` or `application` changes.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start MySQL + Redis** (Docker, fully open source)
   ```bash
   docker compose up -d mysql redis
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # fill in DATABASE_URL (defaults match docker-compose), and the META_*
   # values once you have a Facebook Page + linked Instagram Business account
   ```

4. **Create the database schema**
   ```bash
   npm run prisma:migrate
   ```

5. **(Optional) Seed a sample story**
   ```bash
   npm run db:seed
   ```

6. **Fonts** — the renderer needs real font files to draw the template
   correctly. Download these (all open-source, SIL/Apache licensed) from
   Google Fonts and drop the `.ttf` files into `/fonts`:
   - Anton (regular)
   - Inter (regular + bold)
   - Noto Sans Sinhala (regular)
   - Noto Sans Tamil (regular)

   Without them, it falls back to system fonts — the layout still works,
   it just won't match the exact brand typeface.

7. **Run the app**
   ```bash
   npm run dev
   ```
   Dashboard: http://localhost:3000

8. **Run the worker** (separate process — this is what actually fires
   scheduled Facebook/Instagram publishes on time)
   ```bash
   npm run worker
   ```

## Connecting Facebook + Instagram

1. Create a Facebook App at developers.facebook.com.
2. Generate a long-lived **Page** access token for your Facebook Page.
3. In Meta Business Suite, link an **Instagram Business or Creator account**
   to that Page.
4. Fill in `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_IG_USER_ID` in
   `.env`.

Until these are set, drafting, rendering, and translating all work normally —
only the actual "Publish now" / scheduled publish step needs them, and it
fails with a clear error pointing back here if they're missing.

## Autopilot (fully automatic posting)

The worker runs a tick every `AUTOPILOT_TICK_MINUTES` (default 10):

```
import feeds → drop near-duplicate headlines → pick one story → hashtags
  → translate + render other languages → schedule on FB + IG
```

- **Off by default.** Turn it on with `PATCH /api/automation {"enabled": true}`
  (and off again the same way — that is the kill switch). `GET /api/automation`
  shows all settings: platforms, languages, `dailyCap`, `minGapMinutes`,
  active hours + timezone (default 07:00–23:00 Asia/Colombo), `maxAgeHours`,
  and `blockedKeywords` (matching stories are left as drafts for a person).
- **One story per tick, rotating categories**, so Sri Lanka / India / Foreign
  all get airtime and nothing bursts out at once.
- **Idempotent publishing.** Each post+platform has one `PublishJob` row; a
  retry skips any platform that already went out. A post becomes PUBLISHED
  only when all its platforms have.
- **Instagram:** images are converted to JPEG and padded (not cropped) to a
  valid 4:5 ratio, and the worker waits for Meta to finish processing the media
  before publishing.
- **Alerts:** set `ALERT_WEBHOOK_URL` to be told when a publish fails for good
  or the Meta token expires (checked every 6 hours).
- Images must be reachable from the internet: set `PUBLIC_BASE_URL` to your
  public https address, not `localhost`, or Meta cannot fetch them.

After pulling this change run `npm run prisma:migrate` once (new settings
table, `PublishJob` unique key, story source columns).

> Auto-posting other outlets' headlines and photos carries copyright and
> account-restriction risk. Keep the feed list to outlets you are comfortable
> republishing, and consider licensed/own content.

### Renewing the Meta token

Tokens from the Graph API Explorer last about an hour. To get a permanent Page token:

1. Put `META_APP_ID` and `META_APP_SECRET` in `.env` (once).
2. Generate any fresh token in the Graph API Explorer (permissions: `pages_manage_posts`,
   `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`).
3. Run `npm run meta:connect -- <token>` (or `POST /api/meta/token {"token": "..."}` while signed in).

The script exchanges it for the Page's non-expiring token, verifies it, and stores it in the
database (it overrides `META_PAGE_ACCESS_TOKEN`). The running worker picks it up within about 30
seconds, so nothing needs restarting. The 6-hourly health check alerts you if it ever stops working.

## Translation

Self-host LibreTranslate (uncomment the service in `docker-compose.yml`), or
point `LIBRETRANSLATE_URL` at any compatible instance. Hashtags are left
untranslated on purpose (translating `#BreakingNews` would break its
searchability); body text and captions are translated, with `**gold
highlighted**` terms preserved around their translated equivalent.

## Autopilot page, tests and maintenance

- **Dashboard → Autopilot** is the control room: on/off switch (the kill switch), live status,
  failed posts with a Retry button, the Meta reconnect box, and every setting.
- `npm test` runs the automated tests (no database, Redis or Meta account needed).
- The worker deletes the temporary Facebook/Instagram export images daily.
- On a fresh server, create the schema with `npx prisma migrate deploy`.

## Hosting it for free

See **DEPLOY.md**: Oracle Cloud Always Free server + a free DuckDNS domain + automatic HTTPS
(`docker-compose.prod.yml`).

## Full Docker deployment

```bash
cp .env.example .env   # fill in real values
docker compose up -d --build
```

This runs MySQL, Redis, the Next.js app, and the worker as four containers.

## Troubleshooting

- **`npm install` fails trying to compile `canvas` on Windows** (missing
  Visual Studio C++ tools, or a 404 fetching a prebuilt binary for your Node
  version): this project uses `@napi-rs/canvas`, not `canvas` — it ships
  prebuilt native binaries for Windows/macOS/Linux via npm itself, so there's
  nothing to compile. If you still see this, delete `node_modules` and
  `package-lock.json` and run `npm install` again to make sure the old
  dependency isn't cached.
- **Prefer not to deal with native Node modules at all?** Run everything
  through Docker instead — `docker compose up -d --build` builds the app and
  worker inside Linux containers, so nothing touches your host's Node/Python/
  Visual Studio setup.
- Use an LTS Node version (20 or 22) if you can — it's better tested against
  this stack than very new major versions.

## What's deliberately left for you to extend

- **Auth** — there's no login screen; add one before exposing this publicly.
- **Object storage** — `/api/upload` writes to local disk. Swap in a MinIO
  (open-source, S3-compatible) adapter if you deploy across multiple
  instances.
