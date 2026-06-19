import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input, Select, Button, Radio } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../api/client';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { Section, Cell, Toggle, Spinner, PageLoading, EmptyState } from '../components/shared';
import { confirm, notifySuccess, notifyError, haptics } from '../shell';
import styles from './SettingsPage.module.css';

/**
 * Default publish targets stored as free-form JSON by the backend. The webapp's
 * `PublishTargets` type omits LinkedIn, so Settings uses its own superset shape.
 */
interface SettingsPublishTargets {
  x: boolean;
  instagram_post: boolean;
  instagram_story: boolean;
  instagram_reel: boolean;
  linkedin?: boolean;
}

interface UserSettings {
  language: string;
  timezone: string;
  page_size: number;
  ai_provider: string;
  default_publish_targets: SettingsPublishTargets;
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
  needs_x_reconnect?: boolean;
  needs_linkedin_reconnect?: boolean;
}

const TIMEZONES = [
  'UTC-5', 'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC', 'UTC+1', 'UTC+2', 'UTC+3',
  'UTC+4', 'UTC+5', 'UTC+5:30', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+12',
];
const PAGE_SIZES = [5, 10, 15, 20];

/**
 * Top-level tabbed Settings screen (`/settings`).
 *
 * NOTE (chrome): this is a TOP-LEVEL tabbed route, so it must NOT call useBackButton
 * and must NOT bind MainButton — the custom Tabbar (Layout) is the navigation surface.
 *
 * Live-sync contract: this screen never touches draft state; it only reads/writes user
 * settings, encrypted keys, OAuth health, and the Identity Document via existing endpoints.
 */
export function SettingsPage() {
  const { t, lang } = useTranslation();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<UserSettings>('/api/v1/settings'),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put('/api/v1/settings', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => notifyError(err instanceof Error ? err.message : t('common.error')),
  });

  // OAuth connect flows: fetch the authorize URL, then redirect the in-app browser.
  const connectXMutation = useMutation({
    mutationFn: () => api.startXOAuth(),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (err) => notifyError(err instanceof Error ? err.message : t('common.error')),
  });
  const connectLinkedInMutation = useMutation({
    mutationFn: () => api.startLinkedInOAuth(),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
    onError: (err) => notifyError(err instanceof Error ? err.message : t('common.error')),
  });

  // Handle the post-callback return for X and LinkedIn (?x_connected / ?linkedin_connected).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const x = params.get('x_connected');
    const li = params.get('linkedin_connected');
    if (x === null && li === null) return;

    if (x === '1') void notifySuccess(t('settings.xConnected'));
    else if (x === '0') void notifyError(t('settings.xConnectFailed'));
    if (li === '1') void notifySuccess(t('settings.linkedinConnected'));
    else if (li === '0') void notifyError(t('settings.linkedinConnectFailed'));

    if (x !== null || li !== null) {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['x-oauth-status'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-oauth-status'] });
    }

    params.delete('x_connected');
    params.delete('linkedin_connected');
    const query = params.toString();
    window.history.replaceState(
      null, '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <PageLoading />;
  if (error || !settings) {
    return (
      <div className={styles.screen}>
        <EmptyState
          title={t('common.error')}
          description={error instanceof Error ? error.message : undefined}
          action={<Button size="s" mode="bezeled" onClick={() => refetch()}>{t('common.retry')}</Button>}
        />
      </div>
    );
  }

  const update = (field: string, value: unknown) => updateMutation.mutate({ [field]: value });
  const targets = settings.default_publish_targets ?? {
    x: false, instagram_post: false, instagram_story: false, instagram_reel: false,
  };
  const setTarget = (key: keyof SettingsPublishTargets, value: boolean) =>
    update('default_publish_targets', { ...targets, [key]: value });

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      {/* ───────────── Connections ───────────── */}
      <Section header={t('settings.apiKeys')}>
        <ConnectionRow
          label={t('platform.x')}
          connected={settings.has_x}
          declaredNeedsReconnect={settings.needs_x_reconnect ?? false}
          statusQueryKey="x-oauth-status"
          probe={() => api.getXOAuthStatus()}
          pending={connectXMutation.isPending}
          onConnect={() => connectXMutation.mutate()}
          connectLabel={t('settings.connectX')}
          reconnectLabel={t('settings.reconnectX')}
          refreshLabel={t('settings.refreshXConnection')}
        />
        <ConnectionRow
          label={t('platform.linkedin')}
          connected={settings.has_linkedin}
          declaredNeedsReconnect={settings.needs_linkedin_reconnect ?? false}
          statusQueryKey="linkedin-oauth-status"
          probe={() => api.getLinkedInOAuthStatus()}
          pending={connectLinkedInMutation.isPending}
          onConnect={() => connectLinkedInMutation.mutate()}
          connectLabel={t('settings.connectLinkedIn')}
          reconnectLabel={t('settings.reconnectLinkedIn')}
          refreshLabel={t('settings.refreshLinkedInConnection')}
        />
      </Section>

      <ApiKeysSection settings={settings} />

      {/* ───────────── Identity ───────────── */}
      <IdentitySection lang={lang} hasX={settings.has_x} />

      {/* ───────────── Skills ───────────── */}
      <Section header={t('settings.skills')}>
        <Cell
          interactive
          onClick={() => navigate('/settings/skills')}
          after={<span aria-hidden>{'›'}</span>}
          subtitle={t('settings.systemPrompts')}
        >
          {t('settings.skills')}
        </Cell>
        {isAdmin && (
          <Cell
            interactive
            onClick={() => navigate('/settings/skills?scope=global')}
            after={<span aria-hidden>{'›'}</span>}
            subtitle={t('settings.adminPrompts')}
          >
            {t('settings.globalSkills')}
          </Cell>
        )}
      </Section>

      {/* ───────────── Defaults — publish targets ───────────── */}
      <Section header={t('settings.defaultPlatforms')}>
        <Cell after={<Toggle checked={!!targets.x} onChange={(v) => setTarget('x', v)} />}>
          {t('platform.x')}
        </Cell>
        {settings.has_linkedin && (
          <Cell after={<Toggle checked={!!targets.linkedin} onChange={(v) => setTarget('linkedin', v)} />}>
            {t('platform.linkedin')}
          </Cell>
        )}
        {settings.has_instagram && (
          <>
            <Cell after={<Toggle checked={!!targets.instagram_post} onChange={(v) => setTarget('instagram_post', v)} />}>
              {t('platform.igPost')}
            </Cell>
            <Cell after={<Toggle checked={!!targets.instagram_story} onChange={(v) => setTarget('instagram_story', v)} />}>
              {t('platform.igStory')}
            </Cell>
            <Cell after={<Toggle checked={!!targets.instagram_reel} onChange={(v) => setTarget('instagram_reel', v)} />}>
              {t('platform.igReel')}
            </Cell>
          </>
        )}
      </Section>

      {/* ───────────── Defaults — generation ───────────── */}
      <Section header={t('settings.repostDefaults')}>
        <Cell after={<Toggle checked={settings.repost_defaults?.fastGenerateImage ?? false}
          onChange={(v) => update('repost_defaults', { ...settings.repost_defaults, fastGenerateImage: v })} />}>
          {t('settings.fastImage')}
        </Cell>
        <Cell after={<Toggle checked={settings.repost_defaults?.analyzeSourceImage ?? true}
          onChange={(v) => update('repost_defaults', { ...settings.repost_defaults, analyzeSourceImage: v })} />}>
          {t('settings.analyzeSource')}
        </Cell>
      </Section>

      <Section header={t('settings.commitDefaults')}>
        <Cell after={<Toggle checked={settings.commit_defaults?.commitFastImage ?? true}
          onChange={(v) => update('commit_defaults', { ...settings.commit_defaults, commitFastImage: v })} />}>
          {t('settings.fastImage')}
        </Cell>
        <Cell after={<Toggle checked={settings.commit_defaults?.commitFastAi ?? true}
          onChange={(v) => update('commit_defaults', { ...settings.commit_defaults, commitFastAi: v })} />}>
          {t('settings.fastAi')}
        </Cell>
      </Section>

      <Section header={t('settings.repoDefaults')}>
        <Cell after={<Toggle checked={settings.repo_defaults?.autoOverview ?? false}
          onChange={(v) => update('repo_defaults', { ...settings.repo_defaults, autoOverview: v })} />}>
          {t('settings.autoOverview')}
        </Cell>
        <Cell after={<Toggle checked={settings.repo_defaults?.defaultWatchPushes ?? true}
          onChange={(v) => update('repo_defaults', { ...settings.repo_defaults, defaultWatchPushes: v })} />}>
          {t('settings.watchPushes')}
        </Cell>
      </Section>

      {/* ───────────── Defaults — AI provider ───────────── */}
      <Section header={t('settings.aiProvider')}>
        <div className={styles.radioGroup} role="radiogroup" aria-label={t('settings.aiProvider')}>
          {(['gemini', 'claude'] as const).map((provider) => (
            <label key={provider} className={styles.radioRow}>
              <Radio
                name="ai_provider"
                value={provider}
                checked={settings.ai_provider === provider}
                onChange={() => update('ai_provider', provider)}
              />
              <span>{provider}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* ───────────── Language & General ───────────── */}
      <Section header={t('settings.languageGeneral')}>
        <Cell after={
          <Select
            value={settings.language}
            onChange={(e) => update('language', e.target.value)}
            aria-label={t('settings.language')}
          >
            <option value="en">English</option>
            <option value="he">{'עברית'}</option>
          </Select>
        }>
          {t('settings.language')}
        </Cell>
        <Cell after={
          <Select
            value={settings.timezone}
            onChange={(e) => update('timezone', e.target.value)}
            aria-label={t('settings.timezone')}
          >
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        }>
          {t('settings.timezone')}
        </Cell>
        <Cell after={
          <Select
            value={String(settings.page_size)}
            onChange={(e) => update('page_size', parseInt(e.target.value, 10))}
            aria-label={t('settings.pageSize')}
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        }>
          {t('settings.pageSize')}
        </Cell>
      </Section>
    </div>
  );
}

// ==================== Connections ====================

interface ConnectionRowProps {
  label: string;
  connected: boolean;
  declaredNeedsReconnect: boolean;
  statusQueryKey: string;
  probe: () => Promise<{ connected: boolean; needsReconnect: boolean }>;
  pending: boolean;
  onConnect: () => void;
  connectLabel: string;
  reconnectLabel: string;
  refreshLabel: string;
}

/**
 * A single OAuth connection row (X / LinkedIn). Shows a live health probe on top of the
 * declared DB-presence flag, and ALWAYS offers a reconnect affordance — even when healthy.
 */
function ConnectionRow({
  label, connected, declaredNeedsReconnect, statusQueryKey, probe,
  pending, onConnect, connectLabel, reconnectLabel, refreshLabel,
}: ConnectionRowProps) {
  const { t } = useTranslation();

  // Live token-health probe. Resilient: any failure is ignored (never crashes the page).
  const statusQuery = useQuery({
    queryKey: [statusQueryKey],
    queryFn: probe,
    enabled: connected,
    retry: false,
    staleTime: 30_000,
  });

  const liveNeedsReconnect = statusQuery.data?.needsReconnect ?? false;
  const effectiveNeedsReconnect = declaredNeedsReconnect || liveNeedsReconnect;

  let after: React.ReactNode;
  if (connected && !effectiveNeedsReconnect) {
    // Healthy: status pill + subtle always-available reconnect link.
    after = (
      <span className={styles.trailing}>
        <span className={styles.statusPill} data-state="connected">{t('settings.connected')}</span>
        <button
          type="button"
          className={styles.linkButton}
          onClick={onConnect}
          disabled={pending}
          title={refreshLabel}
        >
          {refreshLabel}
        </button>
      </span>
    );
  } else if (effectiveNeedsReconnect) {
    // Token went stale: prominent reconnect.
    after = (
      <span className={styles.trailing}>
        <span className={styles.statusPill} data-state="reconnect">{t('settings.notConnected')}</span>
        <Button size="s" mode="filled" loading={pending} onClick={onConnect}>{reconnectLabel}</Button>
      </span>
    );
  } else {
    // Never connected.
    after = <Button size="s" mode="filled" loading={pending} onClick={onConnect}>{connectLabel}</Button>;
  }

  return <Cell after={after}>{label}</Cell>;
}

// ==================== Encrypted API keys ====================

/** A service whose key is stored encrypted via PUT /api/v1/settings/keys/:service. */
interface KeyService {
  key: string;
  label: string;
  connected: boolean;
}

function ApiKeysSection({ settings }: { settings: UserSettings }) {
  const { t } = useTranslation();
  const services: KeyService[] = [
    { key: 'gemini', label: 'Gemini', connected: settings.has_gemini },
    { key: 'claude', label: 'Claude', connected: settings.has_claude },
    { key: 'github', label: 'GitHub', connected: settings.has_github },
    { key: 'instagram', label: 'Instagram', connected: settings.has_instagram },
  ];

  return (
    <Section
      header={t('settings.apiKeys')}
      footer={t('settings.apiKeysFooter')}
    >
      {services.map((svc) => <KeyRow key={svc.key} service={svc} />)}
    </Section>
  );
}

/**
 * One encrypted-key row with a collapsible masked input. The input is type="password"
 * so the entered secret is masked; we never display the stored secret (the backend
 * only returns presence flags).
 */
function KeyRow({ service }: { service: KeyService }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [accountId, setAccountId] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = service.key === 'instagram'
        ? { token: value.trim(), accountId: accountId.trim() }
        : { key: value.trim() };
      return api.put(`/api/v1/settings/keys/${service.key}`, body);
    },
    onSuccess: async () => {
      await notifySuccess(t('common.saved'));
      setValue('');
      setAccountId('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => notifyError(err instanceof Error ? err.message : t('common.error')),
  });

  const canSave = service.key === 'instagram'
    ? value.trim().length > 0 && accountId.trim().length > 0
    : value.trim().length > 0;

  return (
    <>
      <Cell
        interactive
        onClick={() => setOpen((o) => !o)}
        after={
          <span className={styles.statusPill} data-state={service.connected ? 'connected' : 'idle'}>
            {service.connected ? t('settings.connected') : t('settings.notConnected')}
          </span>
        }
      >
        {service.label}
      </Cell>
      {open && (
        <div className={styles.editor}>
          {service.key === 'instagram' && (
            <Input
              type="text"
              value={accountId}
              placeholder={t('settings.igAccountId')}
              onChange={(e) => setAccountId(e.target.value)}
            />
          )}
          <Input
            type="password"
            value={value}
            placeholder={service.key === 'instagram'
              ? t('settings.igToken')
              : t('settings.apiKeyPlaceholder', { service: service.label })}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <div className={styles.editorActions}>
            <Button
              size="s"
              mode="filled"
              loading={saveMutation.isPending}
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {service.connected ? t('settings.update') : t('common.save')}
            </Button>
            <Button size="s" mode="plain" onClick={() => { setOpen(false); setValue(''); setAccountId(''); }}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== Identity Document ====================

/**
 * Identity Document view/edit. Reads/writes the real `/api/identity` endpoints
 * (GET ?lang=, POST { lang, content }). Re-analysis attempts the optional
 * `POST /api/v1/identity/reanalyze` endpoint and degrades gracefully if unavailable.
 */
function IdentitySection({ lang, hasX }: { lang: string; hasX: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Identity documents are per-language; a toggle picks which one we view/edit (defaults to the
  // app language). Switching language re-fetches that language's document.
  const [editLang, setEditLang] = useState<'en' | 'he'>(lang === 'he' ? 'he' : 'en');
  // The local edit buffer is tagged with the language it belongs to, so switching language
  // implicitly discards a stale draft without a reset-in-effect.
  const [draftState, setDraftState] = useState<{ lang: string; value: string } | null>(null);
  const setDraft = useCallback(
    (value: string | null) =>
      setDraftState(value === null ? null : { lang: editLang, value }),
    [editLang],
  );

  const identityQuery = useQuery({
    queryKey: ['identity', editLang],
    queryFn: () => api.get<{ content: string; hasIdentity: boolean }>(`/api/identity?lang=${editLang}`),
  });

  // Seed the local editable buffer once the document loads; a draft for a different language is
  // treated as absent so a language switch shows the freshly-loaded document.
  const loadedContent = identityQuery.data?.content ?? '';
  const draft = draftState && draftState.lang === editLang ? draftState.value : null;
  const text = draft ?? loadedContent;

  const saveMutation = useMutation({
    mutationFn: (content: string) => api.post('/api/identity', { lang: editLang, content }),
    onSuccess: async () => {
      await notifySuccess(t('common.saved'));
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['identity', editLang] });
    },
    onError: (err) => notifyError(err instanceof Error ? err.message : t('common.error')),
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => api.post<{ document?: string }>('/api/v1/identity/reanalyze', { lang: editLang }),
    onSuccess: async () => {
      haptics.notification('success');
      await notifySuccess(t('settings.reanalyzeIdentity'));
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['identity', editLang] });
    },
    onError: (err) => {
      // No HTTP re-analyze endpoint exists yet (it runs from the bot's Skills → Identity).
      // Surface a clear, non-crashing message rather than a silent failure.
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        void notifyError(t('identity.reanalyzeUnavailable'));
        return;
      }
      void notifyError(err instanceof Error ? err.message : t('common.error'));
    },
  });

  const dirty = draft !== null && draft.trim() !== loadedContent.trim();
  const busy = reanalyzeMutation.isPending;

  const description = useMemo(
    () => (identityQuery.data?.hasIdentity
      ? t('identity.editHint')
      : t('identity.emptyHint')),
    [identityQuery.data?.hasIdentity, t],
  );

  return (
    <Section header={t('identity.title')} footer={description}>
      <div className={styles.editor}>
        {/* Language toggle (above the text window) — each language has its own document. */}
        <div className={styles.langToggle} role="tablist">
          {(['en', 'he'] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              role="tab"
              className={styles.langBtn}
              data-active={editLang === lng || undefined}
              aria-selected={editLang === lng}
              onClick={() => {
                if (editLang !== lng) {
                  haptics.selectionChanged();
                  setEditLang(lng);
                }
              }}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>

        {identityQuery.isLoading ? (
          <div className={styles.loadingRow}>
            <Spinner size="s" />
            <span>{t('common.loading')}</span>
          </div>
        ) : identityQuery.error ? (
          <>
            <span className={styles.errorText}>
              {identityQuery.error instanceof Error ? identityQuery.error.message : t('common.error')}
            </span>
            <Button size="s" mode="bezeled" onClick={() => identityQuery.refetch()}>{t('common.retry')}</Button>
          </>
        ) : (
          <>
            {/* Borderless textarea — sits directly on the section card, no nested box. */}
            <textarea
              className={styles.identityArea}
              value={text}
              disabled={busy}
              dir="auto"
              placeholder={t('identity.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className={styles.editorActions}>
              <Button
                size="s"
                mode="filled"
                loading={saveMutation.isPending}
                disabled={!dirty || text.trim().length === 0 || saveMutation.isPending}
                onClick={() => saveMutation.mutate(text.trim())}
              >
                {t('common.save')}
              </Button>
              <Button
                size="s"
                mode="bezeled"
                loading={reanalyzeMutation.isPending}
                disabled={busy || !hasX}
                onClick={async () => {
                  const ok = await confirm(t('identity.reanalyzeConfirm'));
                  if (ok) reanalyzeMutation.mutate();
                }}
              >
                {t('settings.reanalyzeIdentity')}
              </Button>
            </div>
            {!hasX && (
              <span className={styles.errorText}>
                {t('identity.noX')}
              </span>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

