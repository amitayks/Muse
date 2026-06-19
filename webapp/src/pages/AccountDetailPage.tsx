import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Caption } from '@telegram-apps/telegram-ui';
import { Section, Cell, Toggle, PageLoading, EmptyState } from '../components/shared';
import { api, ApiError } from '../api/client';
import { useTranslation } from '../i18n';
import {
  useBackButton,
  useMainButton,
  confirmDestructive,
  notifyError,
  popup,
  haptics,
} from '../shell';
import {
  parseAccountConfig,
  type AccountDetail,
  type TwitterAccountConfig,
} from './accounts/types';
import styles from './AccountDetailPage.module.css';

/** Account detail (`/account/:id`) — mirrors the bot's account detail exactly. Flow screen. */
export function AccountDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useBackButton();

  const { data: account, isLoading, isError, refetch } = useQuery({
    queryKey: ['account', id],
    queryFn: () => api.get<AccountDetail>(`/api/v1/accounts/${id}`),
    enabled: id.length > 0,
  });

  // Persist a config change via PUT /accounts/:id { config }.
  const configMutation = useMutation({
    mutationFn: (config: TwitterAccountConfig) =>
      api.put<{ success: boolean }>(`/api/v1/accounts/${id}`, { config }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account', id] });
    },
    onError: async (err) => {
      haptics.notification('error');
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
      await queryClient.invalidateQueries({ queryKey: ['account', id] });
    },
  });

  // Toggle watch (follow/unfollow) via PUT /accounts/:id { is_watching }.
  const watchMutation = useMutation({
    mutationFn: (isWatching: boolean) =>
      api.put<{ success: boolean }>(`/api/v1/accounts/${id}`, {
        is_watching: isWatching ? 1 : 0,
      }),
    onSuccess: async () => {
      haptics.notification('success');
      await queryClient.invalidateQueries({ queryKey: ['account', id] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: async (err) => {
      haptics.notification('error');
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
      await queryClient.invalidateQueries({ queryKey: ['account', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<{ success: boolean }>(`/api/v1/accounts/${id}`),
    onSuccess: async () => {
      haptics.notification('success');
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      navigate('/accounts');
    },
    onError: async (err) => {
      haptics.notification('error');
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const isWatching = account ? account.is_watching === 1 : false;

  // Primary action (system MainButton) = follow / unfollow, mirroring the bot's
  // primary positive/danger control. Hidden until the account is loaded.
  const handleToggleWatch = useCallback(() => {
    if (!account) return;
    watchMutation.mutate(!isWatching);
  }, [account, isWatching, watchMutation]);

  useMainButton(
    account
      ? {
          text: isWatching ? t('accounts.unfollow') : t('accounts.follow'),
          onClick: handleToggleWatch,
          loading: watchMutation.isPending,
          enabled: !watchMutation.isPending,
        }
      : null,
  );

  if (isLoading) return <PageLoading />;

  if (isError || !account) {
    return (
      <EmptyState
        title={t('common.error')}
        action={
          <Button size="m" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  const config = parseAccountConfig(account);

  // Mirror the bot: tapping the threshold cycles 1..10, wrapping 10 -> 1.
  const cycleThreshold = () => {
    haptics.selectionChanged();
    const next = config.relevanceThreshold >= 10 ? 1 : config.relevanceThreshold + 1;
    configMutation.mutate({ ...config, relevanceThreshold: next });
  };

  const setAutoApprove = (value: boolean) => {
    configMutation.mutate({ ...config, autoApprove: value });
  };

  const setAnalyzeMedia = (value: boolean) => {
    configMutation.mutate({ ...config, analyzeMedia: value });
  };

  // Persona / bootstrap: the bot runs an AI analysis job server-side (no HTTP
  // endpoint exists). We surface the persona read-only and explain that the
  // analysis is initiated from the bot.
  const persona = account.overview?.persona ?? null;
  const handlePersona = async () => {
    haptics.impact('light');
    await popup({
      title: persona ? t('accounts.updatePersona') : t('accounts.bootstrapPersona'),
      message: t('accounts.noPersona'),
    });
  };

  const handleDelete = async () => {
    const ok = await confirmDestructive(t('accounts.confirmDelete'), t('common.delete'));
    if (!ok) return;
    deleteMutation.mutate();
  };

  const configBusy = configMutation.isPending;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <Avatar
          size={48}
          src={account.profile_image_url ?? undefined}
          acronym={account.username.slice(0, 1).toUpperCase()}
        />
        <div className={styles.headerText}>
          <a
            className={styles.handle}
            href={`https://x.com/${account.username}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            @{account.username}
          </a>
          {account.display_name && (
            <span className={styles.displayName}>{account.display_name}</span>
          )}
          <span
            className={styles.watchStatus}
            data-watching={isWatching ? 'on' : 'off'}
          >
            {isWatching ? t('repos.watching') : t('repos.paused')}
          </span>
        </div>
      </div>

      <Section header={t('accounts.title')}>
        <Cell
          interactive
          onClick={cycleThreshold}
          after={<span className={styles.value}>{config.relevanceThreshold}/10</span>}
          subtitle={configBusy ? t('common.loading') : undefined}
        >
          {t('accounts.relevance')}
        </Cell>
        <Cell
          after={
            <Toggle
              checked={config.autoApprove}
              disabled={configBusy}
              onChange={setAutoApprove}
            />
          }
        >
          {t('accounts.autoApprove')}
        </Cell>
        <Cell
          after={
            <Toggle
              checked={config.analyzeMedia}
              disabled={configBusy}
              onChange={setAnalyzeMedia}
            />
          }
        >
          {t('accounts.analyzeMedia')}
        </Cell>
      </Section>

      <Section header={t('accounts.persona')}>
        {persona ? (
          <div className={styles.persona}>
            <Caption className={styles.personaText}>{persona}</Caption>
          </div>
        ) : (
          <Cell subtitle={t('accounts.noPersona')}>{t('accounts.persona')}</Cell>
        )}
        <div className={styles.actionRow}>
          <Button mode="bezeled" size="m" stretched onClick={() => void handlePersona()}>
            {persona ? t('accounts.updatePersona') : t('accounts.bootstrapPersona')}
          </Button>
        </div>
      </Section>

      <Section>
        <div className={styles.actionRow}>
          <Button
            mode="bezeled"
            size="m"
            stretched
            loading={deleteMutation.isPending}
            disabled={deleteMutation.isPending}
            onClick={() => void handleDelete()}
          >
            <span className={styles.destructive}>{t('common.delete')}</span>
          </Button>
        </div>
      </Section>
    </div>
  );
}
