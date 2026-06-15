import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, Toggle, useToast } from '../components/ui';
import { FileText } from 'lucide-react';

interface UserSettings {
  language: string;
  timezone: string;
  page_size: number;
  ai_provider: string;
  default_publish_targets: { x: boolean; instagram_post: boolean; instagram_story: boolean; instagram_reel: boolean; linkedin: boolean };
  repost_defaults: { fastGenerateImage: boolean; analyzeSourceImage: boolean };
  commit_defaults: { commitFastImage: boolean; commitFastAi: boolean };
  repo_defaults: { autoOverview: boolean; defaultWatchPushes: boolean };
  has_gemini: boolean;
  has_x: boolean;
  has_github: boolean;
  has_heygen: boolean;
  has_instagram: boolean;
  has_claude: boolean;
  has_linkedin: boolean;
  /** Set by the backend when a stored X OAuth 2.0 token is missing/expired and the user must reconnect. */
  needs_x_reconnect?: boolean;
  /** Set by the backend when a stored LinkedIn OAuth 2.0 token is missing/expired and the user must reconnect. */
  needs_linkedin_reconnect?: boolean;
}

const TIMEZONES = ['UTC-5', 'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC', 'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+5:30', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+12'];
const PAGE_SIZES = [5, 10, 15, 20];

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<UserSettings>('/api/v1/settings'),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put('/api/v1/settings', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast(t('common.saved'), 'success');
    },
  });

  // Start the X OAuth 2.0 connect flow: fetch the authorize URL, then redirect the browser to X.
  const connectXMutation = useMutation({
    mutationFn: () => api.startXOAuth(),
    onSuccess: ({ authorizeUrl }) => {
      window.location.assign(authorizeUrl);
    },
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  // Start the LinkedIn OAuth 2.0 connect flow: fetch the authorize URL, then redirect to LinkedIn.
  const connectLinkedInMutation = useMutation({
    mutationFn: () => api.startLinkedInOAuth(),
    onSuccess: ({ authorizeUrl }) => {
      window.location.assign(authorizeUrl);
    },
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  // Handle the post-callback return: the backend redirects back with ?x_connected / ?linkedin_connected
  // = 1 (or = 0 on failure).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xConnected = params.get('x_connected');
    const linkedinConnected = params.get('linkedin_connected');
    if (xConnected === null && linkedinConnected === null) return;
    if (xConnected !== null) {
      showToast(xConnected === '1' ? t('settings.xConnected') : t('settings.xConnectFailed'), xConnected === '1' ? 'success' : 'error');
    }
    if (linkedinConnected !== null) {
      showToast(linkedinConnected === '1' ? t('settings.linkedinConnected') : t('settings.linkedinConnectFailed'), linkedinConnected === '1' ? 'success' : 'error');
    }
    if (xConnected === '1' || linkedinConnected === '1') {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
    // Strip the params so a refresh doesn't re-trigger the toast (preserve the hash route).
    params.delete('x_connected');
    params.delete('linkedin_connected');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <PageLoading />;
  if (error || !settings) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  function update(field: string, value: unknown) {
    updateMutation.mutate({ [field]: value });
  }

  const services = [
    { key: 'gemini', label: 'Gemini', connected: settings.has_gemini },
    { key: 'claude', label: 'Claude', connected: settings.has_claude },
    { key: 'x', label: 'X / Twitter', connected: settings.has_x },
    { key: 'github', label: 'GitHub', connected: settings.has_github },
    { key: 'instagram', label: 'Instagram', connected: settings.has_instagram },
    { key: 'linkedin', label: 'LinkedIn', connected: settings.has_linkedin },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('settings.title')}</h1>

      {/* General */}
      <Section title={t('settings.general')}>
        <Row label={t('settings.timezone')}>
          <select value={settings.timezone} onChange={e => update('timezone', e.target.value)} style={selectStyle}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Row>
        <Row label={t('settings.language')}>
          <select value={settings.language} onChange={e => update('language', e.target.value)} style={selectStyle}>
            <option value="en">English</option>
            <option value="he">{'\u05E2\u05D1\u05E8\u05D9\u05EA'}</option>
          </select>
        </Row>
        <Row label={t('settings.pageSize')}>
          <select value={settings.page_size} onChange={e => update('page_size', parseInt(e.target.value))} style={selectStyle}>
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
      </Section>

      {/* AI Provider */}
      <Section title={t('settings.aiProvider')}>
        <div style={{ display: 'flex', gap: 'var(--sp-md)' }}>
          {['gemini', 'claude'].map(provider => (
            <label key={provider} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', cursor: 'pointer' }}>
              <input
                type="radio" name="ai_provider" value={provider}
                checked={settings.ai_provider === provider}
                onChange={() => update('ai_provider', provider)}
              />
              <span style={{ fontSize: 'var(--text-sm)', textTransform: 'capitalize' }}>{provider}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Default platforms */}
      <Section title={t('settings.defaultPlatforms')}>
        <ToggleRow label={t('platform.x')} checked={settings.default_publish_targets.x}
          onChange={v => update('default_publish_targets', { ...settings.default_publish_targets, x: v })} />
        {settings.has_instagram && (
          <>
            <ToggleRow label={t('platform.igPost')} checked={settings.default_publish_targets.instagram_post}
              onChange={v => update('default_publish_targets', { ...settings.default_publish_targets, instagram_post: v })} />
            <ToggleRow label={t('platform.igStory')} checked={settings.default_publish_targets.instagram_story}
              onChange={v => update('default_publish_targets', { ...settings.default_publish_targets, instagram_story: v })} />
            <ToggleRow label={t('platform.igReel')} checked={settings.default_publish_targets.instagram_reel}
              onChange={v => update('default_publish_targets', { ...settings.default_publish_targets, instagram_reel: v })} />
          </>
        )}
        {settings.has_linkedin && (
          <ToggleRow label={t('platform.linkedin')} checked={settings.default_publish_targets.linkedin}
            onChange={v => update('default_publish_targets', { ...settings.default_publish_targets, linkedin: v })} />
        )}
      </Section>

      {/* Repost Defaults */}
      <Section title={t('settings.repostDefaults')}>
        <ToggleRow label={t('settings.fastImage')} checked={settings.repost_defaults?.fastGenerateImage ?? false}
          onChange={v => update('repost_defaults', { ...settings.repost_defaults, fastGenerateImage: v })} />
        <ToggleRow label={t('settings.analyzeSource')} checked={settings.repost_defaults?.analyzeSourceImage ?? true}
          onChange={v => update('repost_defaults', { ...settings.repost_defaults, analyzeSourceImage: v })} />
      </Section>

      {/* Commit Defaults */}
      <Section title={t('settings.commitDefaults')}>
        <ToggleRow label={t('settings.fastImage')} checked={settings.commit_defaults?.commitFastImage ?? true}
          onChange={v => update('commit_defaults', { ...settings.commit_defaults, commitFastImage: v })} />
        <ToggleRow label={t('settings.fastAi')} checked={settings.commit_defaults?.commitFastAi ?? true}
          onChange={v => update('commit_defaults', { ...settings.commit_defaults, commitFastAi: v })} />
      </Section>

      {/* Repo Defaults */}
      <Section title={t('settings.repoDefaults')}>
        <ToggleRow label={t('settings.autoOverview')} checked={settings.repo_defaults?.autoOverview ?? false}
          onChange={v => update('repo_defaults', { ...settings.repo_defaults, autoOverview: v })} />
        <ToggleRow label={t('settings.watchPushes')} checked={settings.repo_defaults?.defaultWatchPushes ?? true}
          onChange={v => update('repo_defaults', { ...settings.repo_defaults, defaultWatchPushes: v })} />
      </Section>

      {/* API Keys */}
      <Section title={t('settings.apiKeys')}>
        {services.map(svc => (
          <div key={svc.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-xs) 0' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{svc.label}</span>
            {svc.key === 'x' ? (
              <XConnectControl
                connected={settings.has_x}
                needsReconnect={settings.needs_x_reconnect ?? false}
                pending={connectXMutation.isPending}
                onConnect={() => connectXMutation.mutate()}
              />
            ) : svc.key === 'linkedin' ? (
              <LinkedInConnectControl
                connected={settings.has_linkedin}
                needsReconnect={settings.needs_linkedin_reconnect ?? false}
                pending={connectLinkedInMutation.isPending}
                onConnect={() => connectLinkedInMutation.mutate()}
              />
            ) : (
              <span className={`badge ${svc.connected ? 'badge-approved' : 'badge-draft'}`}>
                {svc.connected ? t('settings.connected') : t('settings.notConnected')}
              </span>
            )}
          </div>
        ))}
      </Section>

      {/* Skills */}
      <Section title={t('settings.skills')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <a href="#/settings/prompts" style={{ color: 'var(--link)', fontSize: 'var(--text-sm)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} /> {t('settings.systemPrompts')}
          </a>
          {/* Admin prompts link would show conditionally based on isAdmin — need useAuth here */}
        </div>
      </Section>

      {toastEl}
    </div>
  );
}

// ==================== Helpers ====================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-md)' }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-xs) 0' }}>
      <span style={{ fontSize: 'var(--text-sm)' }}>{label}</span>
      {children}
    </div>
  );
}

function XConnectControl({
  connected, needsReconnect, pending, onConnect,
}: {
  connected: boolean;
  needsReconnect: boolean;
  pending: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation();

  // Live token-health probe. The settings query reports DB-presence; this asks the backend
  // to actually resolve a bearer (refreshing / clearing a dead token), so we can flip into
  // the reconnect state even when the cached settings still say "connected".
  // Resilient: any fetch error is ignored — it must never crash the page.
  const statusQuery = useQuery({
    queryKey: ['x-oauth-status'],
    queryFn: () => api.getXOAuthStatus(),
    enabled: connected,
    retry: false,
    staleTime: 30_000,
  });

  // Merge the live probe with the prop: needsReconnect wins if either source flags it.
  const liveNeedsReconnect = statusQuery.data?.needsReconnect ?? false;
  const effectiveNeedsReconnect = needsReconnect || liveNeedsReconnect;

  // Connected and healthy -> show the badge plus a subtle, always-available reconnect affordance.
  if (connected && !effectiveNeedsReconnect) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
        <span className="badge badge-approved">{t('settings.connected')}</span>
        <button
          type="button"
          onClick={onConnect}
          disabled={pending}
          title={t('settings.refreshXConnection')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: pending ? 'default' : 'pointer',
            color: 'var(--link)',
            fontSize: '12px',
            textDecoration: 'underline',
            opacity: pending ? 0.5 : 1,
          }}
        >
          {t('settings.refreshXConnection')}
        </button>
      </span>
    );
  }
  // Either never connected, or the stored/live token went stale -> offer a prominent (re)connect action.
  const label = effectiveNeedsReconnect ? t('settings.reconnectX') : t('settings.connectX');
  return (
    <button className="btn btn-primary" onClick={onConnect} disabled={pending}>
      {label}
    </button>
  );
}

function LinkedInConnectControl({
  connected, needsReconnect, pending, onConnect,
}: {
  connected: boolean;
  needsReconnect: boolean;
  pending: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation();

  // Live token-health probe (mirrors XConnectControl): asks the backend to actually resolve a
  // bearer (refreshing / clearing a dead token) so we can flip into the reconnect state even when
  // the cached settings still say "connected". Any fetch error is ignored — never crash the page.
  const statusQuery = useQuery({
    queryKey: ['linkedin-oauth-status'],
    queryFn: () => api.getLinkedInOAuthStatus(),
    enabled: connected,
    retry: false,
    staleTime: 30_000,
  });

  const liveNeedsReconnect = statusQuery.data?.needsReconnect ?? false;
  const effectiveNeedsReconnect = needsReconnect || liveNeedsReconnect;

  // Connected and healthy -> badge plus a subtle, always-available reconnect affordance.
  if (connected && !effectiveNeedsReconnect) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
        <span className="badge badge-approved">{t('settings.connected')}</span>
        <button
          type="button"
          onClick={onConnect}
          disabled={pending}
          title={t('settings.refreshLinkedInConnection')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: pending ? 'default' : 'pointer',
            color: 'var(--link)',
            fontSize: '12px',
            textDecoration: 'underline',
            opacity: pending ? 0.5 : 1,
          }}
        >
          {t('settings.refreshLinkedInConnection')}
        </button>
      </span>
    );
  }
  // Either never connected, or the stored/live token went stale -> prominent (re)connect action.
  const label = effectiveNeedsReconnect ? t('settings.reconnectLinkedIn') : t('settings.connectLinkedIn');
  return (
    <button className="btn btn-primary" onClick={onConnect} disabled={pending}>
      {label}
    </button>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-xs) 0' }}>
      <span style={{ fontSize: 'var(--text-sm)' }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font)',
};
