'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { InputTextarea } from 'primereact/inputtextarea';
import { Checkbox } from 'primereact/checkbox';
import { FileUpload } from 'primereact/fileupload';
import { Card } from 'primereact/card';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { StoryList } from './StoryList';
import { EditPostModal } from './EditPostModal';
import { dateToInput, fromDateInput, todayInput } from './dateLabels';
import { PostPreview } from './PostPreview';
import { HashtagInput } from './HashtagInput';
import { useLivePreview } from './useLivePreview';
import { HeadlineToggles } from './HeadlineToggles';
import { AppTopBar } from './AppTopBar';
import { AuditTrail } from './AuditTrail';
import { AutopilotPanel } from './AutopilotPanel';
import { DEFAULT_TEXT_STYLE, TextStyleControls, styleToPayload } from './TextStyleControls';

type Category = 'SRI_LANKA' | 'INDIA' | 'FOREIGN';
type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
type Mode = 'TEMPLATE' | 'DIRECT_IMAGE';

interface PostDto {
  id: string;
  storyId: string;
  category?: Category;
  language: string;
  mode: Mode;
  status: PostStatus;
  dateLabel?: string | null;
  yearLabel?: string | null;
  badgeWord?: string | null;
  bodyText?: string | null;
  creditTag?: string | null;
  photoUrl?: string | null;
  renderedImageUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  scheduledAt?: string | null;
  updatedAt: string;
}

type View = 'home' | 'analytics' | 'news' | 'sent' | 'upload' | 'autopilot' | 'audit';
type NewsFilter = 'all' | 'pending' | 'sent';

const REGIONS: Category[] = ['SRI_LANKA', 'INDIA', 'FOREIGN'];
const NEWS_FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'sent', label: 'Sent' }
];
const FILTER_SUB: Record<NewsFilter, string> = {
  all: 'Everything uploaded for this region',
  pending: 'Drafts, scheduled and failed stories waiting to go out',
  sent: 'Already published to Facebook and Instagram'
};
// New captions start empty.
const CAPTION_TEMPLATE = '';
const isSent = (p: { status: PostStatus }) => p.status === 'PUBLISHED';

const CATEGORY_LABEL: Record<Category, string> = {
  SRI_LANKA: 'Sri Lanka',
  INDIA: 'India',
  FOREIGN: 'Foreign Countries'
};

const CATEGORY_ICON: Record<Category, string> = { SRI_LANKA: 'pi-map-marker', INDIA: 'pi-flag', FOREIGN: 'pi-globe' };
const STATUS_ICON: Record<PostStatus, string> = { DRAFT: 'pi-file-edit', SCHEDULED: 'pi-clock', PUBLISHED: 'pi-check-circle', FAILED: 'pi-exclamation-triangle' };
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ label: CATEGORY_LABEL[c], value: c }));
const MODE_OPTIONS: { label: string; value: Mode }[] = [
  { label: 'Use template', value: 'TEMPLATE' },
  { label: 'Direct image upload', value: 'DIRECT_IMAGE' }
];

export default function Dashboard() {
  const [view, setView] = useState<View>('home');
  const [navOpen, setNavOpen] = useState(false); // off-canvas sidebar on small screens
  const [activeCategory, setActiveCategory] = useState<Category>('SRI_LANKA');
  const [stats, setStats] = useState<{ byCategory: Record<Category, number>; byStatus: Record<PostStatus, number>; recent: PostDto[] } | null>(null);
  const [allPosts, setAllPosts] = useState<PostDto[]>([]); // drives the sidebar counts and the News / Sent lists
  const [newsFilter, setNewsFilter] = useState<NewsFilter>('all');
  const [sentRegion, setSentRegion] = useState<Category | 'all'>('all');
  // Regions are independent accordions: opening or visiting one never closes another, so the items below it don't jump.
  const [openGroups, setOpenGroups] = useState<Set<Category>>(new Set(['SRI_LANKA']));
  const openGroup = (c: Category) => setOpenGroups((g) => new Set(g).add(c));
  const toggleGroup = (c: Category) => setOpenGroups((g) => { const n = new Set(g); if (!n.delete(c)) n.add(c); return n; });
  const [collapsedPref, setCollapsed] = useState(false); // user's choice of the icon-rail sidebar
  const [wide, setWide] = useState(true); // the rail only exists above the drawer breakpoint
  const collapsed = collapsedPref && wide;
  const [flyout, setFlyout] = useState<{ category: Category; top: number } | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);

  const [form, setForm] = useState({
    category: 'SRI_LANKA' as Category,
    mode: 'TEMPLATE' as Mode,
    date: todayInput(),
    bodyText: '',
    caption: CAPTION_TEMPLATE,
    hashtags: '',
    showBreaking: false,
    showNews: true
  });
  const [style, setStyle] = useState(DEFAULT_TEXT_STYLE);
  const [photo, setPhoto] = useState(''); // uploaded photo URL (uploaded as soon as it's picked, so the preview can use it)
  const [uploading, setUploading] = useState(false);
  const [savedPost, setSavedPost] = useState<PostDto | null>(null);
  const [languages, setLanguages] = useState<Record<string, boolean>>({ si: true, ta: true, hi: false });
  const [statusMsg, setStatusMsg] = useState('');

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  async function loadStats() {
    const res = await fetch('/api/dashboard-stats');
    if (!res.ok) {
      setStatusMsg(`Failed to load dashboard stats (HTTP ${res.status}). Is the database running?`);
      return;
    }
    setStats(await res.json());
  }

  const [fetching, setFetching] = useState(false);
  const [editing, setEditing] = useState<PostDto | null>(null);

  function refreshCurrentView() {
    if (view === 'home' || view === 'analytics') loadStats();
    loadAll();
  }

  async function fetchFeeds() {
    setFetching(true);
    try {
      const res = await fetch('/api/feeds/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = await res.json();
      setStatusMsg(`Fetched feeds: ${r.imported} new, ${r.skipped} already imported${r.errors.length ? `, ${r.errors.length} feed(s) failed` : ''}.`);
      await loadStats();
    } catch (err) {
      setStatusMsg(`Feed refresh failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setFetching(false);
    }
  }

  // One request at a time: React's dev double-mount and quick view switches share the same fetch.
  const loading = useRef<Promise<void> | null>(null);
  function loadAll() {
    return (loading.current ??= fetch('/api/posts')
      .then(async (res) => { if (res.ok) setAllPosts(await res.json()); })
      .finally(() => { loading.current = null; }));
  }

  useEffect(() => {
    if (view === 'home' || view === 'analytics') loadStats();
    loadAll();
  }, [view]);

  // The address bar follows the page (?view=news&region=INDIA&filter=draft), so refresh, back and deep links work.
  const [urlReady, setUrlReady] = useState(false);
  const urlSynced = useRef(false);
  const VIEWS: View[] = ['home', 'analytics', 'news', 'sent', 'upload', 'autopilot', 'audit'];
  function readUrl() {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('view') as View | null;
    setView(v && VIEWS.includes(v) ? v : 'home');
    const region = q.get('region') as Category | null;
    if (region && REGIONS.includes(region)) { setActiveCategory(region); openGroup(region); }
    const f = q.get('filter') as NewsFilter | null;
    setNewsFilter(f && NEWS_FILTERS.some((x) => x.id === f) ? f : 'all');
    const sent = q.get('sent');
    setSentRegion(sent && (REGIONS as string[]).includes(sent) ? (sent as Category) : 'all');
  }
  useEffect(() => {
    readUrl();
    setUrlReady(true); // batched with readUrl's setStates, so the writer below first runs with the restored state
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const q = new URLSearchParams();
    if (view !== 'home') q.set('view', view);
    if (view === 'news') { q.set('region', activeCategory); if (newsFilter !== 'all') q.set('filter', newsFilter); }
    if (view === 'sent' && sentRegion !== 'all') q.set('sent', sentRegion);
    const next = `${window.location.pathname}${q.size ? `?${q}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      // The first sync only normalises the URL (e.g. drops ?view=bogus), so it must not add a history entry.
      if (urlSynced.current) window.history.pushState(null, '', next);
      else window.history.replaceState(null, '', next);
    }
    urlSynced.current = true;
  }, [urlReady, view, activeCategory, newsFilter, sentRegion]);

  // Remember the collapsed sidebar between visits.
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('sidebar-collapsed') === '1'); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
    setFlyout(null);
  }

  const count = (region: Category | 'all', f: NewsFilter) =>
    allPosts.filter((p) => (region === 'all' || p.category === region) && (f === 'all' || (f === 'sent') === isSent(p))).length;
  const newsPosts = allPosts.filter((p) => p.category === activeCategory && (newsFilter === 'all' || (newsFilter === 'sent') === isSent(p)));
  const sentPosts = allPosts.filter((p) => isSent(p) && (sentRegion === 'all' || p.category === sentRegion));

  const closeNav = () => setNavOpen(false);
  function goView(v: View) { setView(v); setFlyout(null); closeNav(); }
  function goRegion(c: Category, f: NewsFilter) {
    setActiveCategory(c); setNewsFilter(f); openGroup(c); setView('news'); setFlyout(null); closeNav();
  }
  function showFlyout(category: Category, el: HTMLElement) {
    if (collapsed) setFlyout({ category, top: el.getBoundingClientRect().top });
  }

  async function handlePickPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhoto((await res.json()).url);
      setStatusMsg('');
    } catch (err) {
      setStatusMsg(`Photo upload failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setUploading(false);
    }
  }

  const { preview, rendering, error: previewError } = useLivePreview({
    enabled: view === 'upload' && form.mode === 'TEMPLATE',
    photo,
    bodyText: form.bodyText,
    date: form.date,
    language: 'en',
    style,
    showBreaking: form.showBreaking,
    showNews: form.showNews
  });

  async function handleSave(status: 'DRAFT' | 'PUBLISH') {
    setStatusMsg('Saving...');
    const photoUrl = photo || undefined;

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: form.category,
        mode: form.mode,
        ...fromDateInput(form.date),
        ...styleToPayload(style),
        showBreaking: form.showBreaking,
        showNews: form.showNews,
        bodyText: form.bodyText,
        photoUrl,
        caption: form.caption,
        hashtags: form.hashtags
      })
    });
    const post: PostDto = await res.json();
    if (!res.ok) {
      const e = (post as unknown as { error?: unknown }).error;
      setStatusMsg(`Could not save: ${typeof e === 'string' ? e : 'please check the photo and news text.'}`);
      return;
    }

    if (form.mode === 'TEMPLATE' && photoUrl) {
      await fetch(`/api/posts/${post.id}/image`, { method: 'POST' });
    }

    setSavedPost(post);
    setStatusMsg(`Saved as ${status === 'PUBLISH' ? 'draft, ready to publish' : 'draft'}.`);
  }

  async function handlePublishNow() {
    if (!savedPost) return;
    setStatusMsg('Publishing...');
    const res = await fetch(`/api/posts/${savedPost.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms: ['FACEBOOK', 'INSTAGRAM'] })
    });
    const data = await res.json();
    setStatusMsg(res.ok ? 'Published to Facebook + Instagram.' : `Failed: ${data.error}`);
  }

  async function handleSchedule(when: Date | null) {
    if (!savedPost || !when) return;
    const datetimeLocal = when.toISOString();
    setStatusMsg('Scheduling...');
    const res = await fetch(`/api/posts/${savedPost.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms: ['FACEBOOK', 'INSTAGRAM'],
        scheduledAt: new Date(datetimeLocal).toISOString()
      })
    });
    const data = await res.json();
    setStatusMsg(res.ok ? `Scheduled for ${new Date(datetimeLocal).toLocaleString()}.` : `Failed: ${data.error}`);
  }

  async function handleTranslate() {
    if (!savedPost) return;
    const targets = Object.entries(languages).filter(([, on]) => on).map(([lang]) => lang);
    if (!targets.length) return;
    setStatusMsg(`Translating into ${targets.join(', ')}...`);
    const res = await fetch(`/api/posts/${savedPost.id}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languages: targets })
    });
    const data = await res.json();
    setStatusMsg(res.ok ? `Created ${data.length} translated draft(s).` : `Failed: ${data.error}`);
  }

  const titles: Record<View, [string, string]> = {
    home: ['Home', 'Overview across Sri Lanka, India and Foreign Countries'],
    analytics: ['Analytics', 'Counts by category and status'],
    news: [CATEGORY_LABEL[activeCategory], FILTER_SUB[newsFilter]],
    sent: ['Sent', 'Everything sent across all regions'],
    autopilot: ['Autopilot', 'Automatic posting to Facebook and Instagram: on/off, limits, failures and connection'],
    audit: ['Audit trail', 'Who signed in, created, edited, scheduled, published or deleted what, newest first'],
    upload: ['Upload', 'Create a story, render it, translate it, then publish or schedule']
  };
  const [pageTitle, pageSub] = titles[view];

  return (
    <div className="app-shell">
      <div className={`nav-scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidebar ${navOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} onMouseLeave={() => setFlyout(null)}>
        <div className="brand">
          <img className="brand-logo" src="/brand/logo-sm.png" alt="Lynx Plus" />
          <span className="brand-name">LYNX._PLUS</span>
          <div className="tagline">Beyond Headlines. Closer to Truth</div>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          <button className="nav-item" aria-label="Home" title="Home" aria-current={view === 'home' ? 'page' : undefined} onClick={() => goView('home')}><i className="pi pi-home" /><span className="nav-label">Home</span></button>
          <button className="nav-item" aria-label="Analytics" title="Analytics" aria-current={view === 'analytics' ? 'page' : undefined} onClick={() => goView('analytics')}><i className="pi pi-chart-bar" /><span className="nav-label">Analytics</span></button>
          <div className="nav-group-label" id="nav-news-label">News</div>
          <div className="nav-rule" aria-hidden="true" />
          {REGIONS.map((c) => {
            const open = openGroups.has(c) && !collapsed;
            const inRegion = view === 'news' && activeCategory === c;
            return (
              <div key={c} className="nav-group">
                <button
                  className={`nav-item nav-head ${inRegion ? 'has-active' : ''}`}
                  aria-expanded={open}
                  aria-controls={`nav-sub-${c}`}
                  aria-label={CATEGORY_LABEL[c]}
                  onClick={() => (collapsed ? goRegion(c, 'all') : toggleGroup(c))}
                  onMouseEnter={(e) => showFlyout(c, e.currentTarget)}
                  onFocus={(e) => showFlyout(c, e.currentTarget)}
                >
                  <i className={`pi ${CATEGORY_ICON[c]}`} />
                  <span className="nav-label">{CATEGORY_LABEL[c]}</span>
                  <span className="nav-badge" title="Pending">{count(c, 'pending')}</span>
                  <i className="pi pi-angle-right nav-chev" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined }} />
                </button>
                {open && (
                  <div className="nav-sub" id={`nav-sub-${c}`}>
                    {NEWS_FILTERS.map((f) => {
                      const active = inRegion && newsFilter === f.id;
                      return (
                        <button key={f.id} className="nav-item nav-subitem" aria-current={active ? 'page' : undefined} onClick={() => goRegion(c, f.id)}>
                          <span className="nav-label">{f.label}</span>
                          <span className="nav-count">{count(c, f.id)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <button className="nav-item nav-sent" aria-label="Sent, all regions" title="Sent" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => goView('sent')}>
            <i className="pi pi-check-circle" /><span className="nav-label">Sent</span><span className="nav-note">All regions</span>
          </button>
          <button className="nav-item" aria-label="Upload" title="Upload" aria-current={view === 'upload' ? 'page' : undefined} onClick={() => goView('upload')}>
            <i className="pi pi-upload" /><span className="nav-label">Upload</span>
          </button>
          <button className="nav-item" aria-label="Autopilot" title="Autopilot" aria-current={view === 'autopilot' ? 'page' : undefined} onClick={() => goView('autopilot')}>
            <i className="pi pi-bolt" /><span className="nav-label">Autopilot</span>
          </button>
          <button className="nav-item" aria-label="Audit trail" title="Audit trail" aria-current={view === 'audit' ? 'page' : undefined} onClick={() => goView('audit')}>
            <i className="pi pi-history" /><span className="nav-label">Audit trail</span>
          </button>
        </nav>
      </aside>

      {collapsed && flyout && (
        <div className="nav-flyout" role="menu" aria-label={CATEGORY_LABEL[flyout.category]} style={{ top: flyout.top }} onMouseLeave={() => setFlyout(null)}>
          <div className="nav-flyout-title">{CATEGORY_LABEL[flyout.category]}</div>
          {NEWS_FILTERS.map((f) => (
            <button key={f.id} role="menuitem" className="nav-item nav-subitem" aria-current={view === 'news' && activeCategory === flyout.category && newsFilter === f.id ? 'page' : undefined} onClick={() => goRegion(flyout.category, f.id)}>
              <span className="nav-label">{f.label}</span>
              <span className="nav-count">{count(flyout.category, f.id)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="app-body">
      <AppTopBar
        title={pageTitle}
        subtitle={pageSub}
        sidebarOpen={wide ? !collapsed : navOpen}
        onToggleSidebar={() => (wide ? toggleCollapsed() : setNavOpen((o) => !o))}
        onSignOut={signOut}
      />
      <main className="main">
        {view === 'home' && stats && (
          <>
            <div className="stat-grid">
              {Object.entries(stats.byStatus).map(([status, count]) => <StatTile key={status} icon={STATUS_ICON[status as PostStatus]} count={count} label={status} />)}
            </div>
            <div className="page-head">
              <h3>Recent stories</h3>
              <Button label={fetching ? 'Fetching…' : 'Fetch latest news'} icon="pi pi-refresh" loading={fetching} onClick={fetchFeeds} />
            </div>
            <StoryList posts={stats.recent} onOpen={setEditing} emptyText="No stories yet. Go to Upload to create your first one." />
          </>
        )}

        {view === 'analytics' && stats && (
          <>
            <h3>By category</h3>
            <div className="stat-grid">
              {Object.entries(stats.byCategory).map(([cat, count]) => <StatTile key={cat} icon={CATEGORY_ICON[cat as Category]} count={count} label={CATEGORY_LABEL[cat as Category]} />)}
            </div>
            <h3>By status</h3>
            <div className="stat-grid">
              {Object.entries(stats.byStatus).map(([status, count]) => <StatTile key={status} icon={STATUS_ICON[status as PostStatus]} count={count} label={status} />)}
            </div>
          </>
        )}

        {view === 'news' && (
          <>
            <div className="seg" role="group" aria-label="Status filter">
              {NEWS_FILTERS.map((f) => (
                <button key={f.id} type="button" className={newsFilter === f.id ? 'on' : ''} aria-pressed={newsFilter === f.id} onClick={() => setNewsFilter(f.id)}>
                  {f.label} <span>{count(activeCategory, f.id)}</span>
                </button>
              ))}
            </div>
            <StoryList key={`${activeCategory}-${newsFilter}`} posts={newsPosts} onOpen={setEditing} emptyText="No stories here yet." />
          </>
        )}

        {view === 'sent' && (
          <>
            <div className="seg" role="group" aria-label="Region filter">
              {(['all', ...REGIONS] as const).map((r) => (
                <button key={r} type="button" className={sentRegion === r ? 'on' : ''} aria-pressed={sentRegion === r} onClick={() => setSentRegion(r)}>
                  {r === 'all' ? 'All regions' : CATEGORY_LABEL[r]} <span>{count(r, 'sent')}</span>
                </button>
              ))}
            </div>
            <StoryList key={`sent-${sentRegion}`} posts={sentPosts} onOpen={setEditing} emptyText="Nothing has been sent yet." />
          </>
        )}

        {view === 'autopilot' && <AutopilotPanel />}

        {view === 'audit' && (
          <>
            <AuditTrail />
          </>
        )}

        {view === 'upload' && (
          <>

            <div className="upload-grid">
            <div className="upload-preview">
              <PostPreview
                image={(form.mode === 'TEMPLATE' && preview) || photo}
                rendering={rendering || uploading}
                error={previewError}
                caption={form.caption}
                hashtags={form.hashtags}
              />
            </div>
            <div className="editor">
              <div className="field">
                <label>Category</label>
                <Dropdown value={form.category} options={CATEGORY_OPTIONS} onChange={(e) => setForm({ ...form, category: e.value as Category })} />
              </div>
              <div className="field">
                <label>Mode</label>
                <Dropdown value={form.mode} options={MODE_OPTIONS} onChange={(e) => setForm({ ...form, mode: e.value as Mode })} />
              </div>
              <div className="field">
                <label>Photo</label>
                <FileUpload
                  mode="basic"
                  accept="image/*"
                  auto
                  customUpload
                  chooseLabel={photo ? 'Change photo' : 'Choose photo'}
                  disabled={uploading}
                  uploadHandler={(e) => handlePickPhoto(e.files[0] ?? null)}
                />
              </div>
              {form.mode === 'TEMPLATE' && (
                <>
                  <div className="field">
                    <label>Date shown on the image</label>
                    <Calendar
                      value={form.date ? new Date(`${form.date}T00:00:00`) : null}
                      onChange={(e) => setForm({ ...form, date: e.value instanceof Date ? dateToInput(e.value) : form.date })}
                      dateFormat="yy-mm-dd"
                      showIcon
                      icon="pi pi-calendar"
                    />
                  </div>
                  <div className="field"><label>News text (wrap key terms in **stars** to highlight them in gold)</label><InputTextarea rows={5} autoResize value={form.bodyText} onChange={(e) => setForm({ ...form, bodyText: e.target.value })} /></div>
                  <HeadlineToggles value={form} onChange={(h) => setForm({ ...form, ...h })} />
                  <TextStyleControls value={style} onChange={setStyle} />
                </>
              )}
              <div className="field"><label>Caption</label><InputTextarea rows={4} autoResize value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
              <div className="field">
                <label>Hashtags</label>
                <HashtagInput
                  value={form.hashtags}
                  onChange={(hashtags) => setForm({ ...form, hashtags })}
                  text={`${form.bodyText} ${form.caption}`}
                  category={form.category}
                  language="en"
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button label="Save draft" icon="pi pi-save" outlined onClick={() => handleSave('DRAFT')} />
                <Button label="Save & prepare" icon="pi pi-check" onClick={() => handleSave('PUBLISH')} />
              </div>

              {savedPost && (
                <>
                  <Divider />
                  <div className="field">
                    <label>Translate into other languages</label>
                    <div className="lang-chips">
                      {Object.entries({ si: 'Sinhala', ta: 'Tamil', hi: 'Hindi' }).map(([code, label]) => (
                        <label className="lang-chip" key={code}>
                          <Checkbox
                            inputId={`lang-${code}`}
                            checked={languages[code] ?? false}
                            onChange={(e) => setLanguages({ ...languages, [code]: !!e.checked })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Button label="Generate translations" icon="pi pi-language" outlined onClick={handleTranslate} style={{ marginTop: 8, width: 'fit-content' }} />
                  </div>

                  <Divider />
                  <div className="field">
                    <label>Schedule publish (optional)</label>
                    <div className="schedule-row">
                      <Calendar className="schedule-when" value={scheduleAt} onChange={(e) => setScheduleAt((e.value as Date) ?? null)} showTime hourFormat="24" showIcon icon="pi pi-calendar" minDate={new Date()} placeholder="Pick date and time" />
                      <Button label="Schedule" icon="pi pi-clock" outlined disabled={!scheduleAt} onClick={() => handleSchedule(scheduleAt)} />
                    </div>
                  </div>
                  <Button label="Publish now (Facebook + Instagram)" icon="pi pi-send" onClick={handlePublishNow} />
                </>
              )}

              {statusMsg && <Message severity={/^(Failed|Could not|Photo upload failed|Feed refresh failed)/.test(statusMsg) ? 'error' : 'info'} text={statusMsg} />}
            </div>
            </div>
          </>
        )}
      </main>
      </div>

      {editing && (
        <EditPostModal
          key={editing.id}
          post={editing}
          onClose={() => setEditing(null)}
          onChanged={refreshCurrentView}
        />
      )}
    </div>
  );
}

function StatTile({ icon, count, label }: { icon: string; count: number; label: string }) {
  return (
    <Card className="stat-tile">
      <i className={`pi ${icon} stat-icon`} />
      <div className="num">{count}</div>
      <div className="label">{label}</div>
    </Card>
  );
}
