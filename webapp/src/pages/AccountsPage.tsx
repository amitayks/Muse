import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Input } from '@telegram-apps/telegram-ui';
import { TimelineRow, Spinner, EmptyState } from '../components/shared';
import { api, ApiError } from '../api/client';
import { useTranslation } from '../i18n';
import { notifyError, haptics, popup } from '../shell';
import type { TwitterAccount } from './accounts/types';
import styles from './AccountsPage.module.css';

interface AccountsResponse {
  accounts: TwitterAccount[];
}

/** Client-side username validation, mirroring the bot's add-account input guard. */
function isValidUsername(raw: string): boolean {
  const username = raw.trim().replace(/^@/, '');
  return username.length >= 1 && username.length <= 15 && /^[a-zA-Z0-9_]+$/.test(username);
}

/**
 * Top-level tabbed screen (`/accounts`). Mirrors the Home timeline: a pinned title, a scrolling
 * list of timeline-style account cards, and the add-by-@username field pinned at the bottom
 * (where Home's compose bar sits). Adding validates the handle on X and opens its detail page.
 */
export function AccountsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draftUsername, setDraftUsername] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountsResponse>('/api/v1/accounts'),
  });

  const accounts = useMemo(() => data?.accounts ?? [], [data]);

  const addMutation = useMutation({
    mutationFn: (username: string) =>
      api.post<{ success: boolean; id: string }>('/api/v1/accounts', {
        username: username.trim().replace(/^@/, ''),
      }),
    onSuccess: async (res) => {
      haptics.notification('success');
      setDraftUsername('');
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      navigate(`/account/${res.id}`);
    },
    onError: async (err) => {
      haptics.notification('error');
      const msg = err instanceof ApiError ? err.message : t('common.error');
      await notifyError(msg);
    },
  });

  const handleAdd = useCallback(async () => {
    const username = draftUsername.trim().replace(/^@/, '');
    if (!isValidUsername(username)) {
      haptics.notification('error');
      await popup({
        title: t('accounts.addAccount'),
        message: t('accounts.usernamePlaceholder'),
      });
      return;
    }
    addMutation.mutate(username);
  }, [draftUsername, addMutation, t]);

  const adding = addMutation.isPending;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('accounts.title')}</h1>
      </header>

      <div className={styles.body}>
        {isLoading ? (
          <div className={styles.center}>
            <Spinner size="m" />
          </div>
        ) : isError ? (
          <div className={styles.center}>
            <EmptyState
              title={t('common.error')}
              action={
                <Button size="s" onClick={() => refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          </div>
        ) : accounts.length === 0 ? (
          <div className={styles.center}>
            <EmptyState title={t('accounts.noAccounts')} description={t('accounts.usernamePlaceholder')} />
          </div>
        ) : (
          <>
            <div className={styles.sectionHeader}>{`${accounts.length} ${t('common.total')}`}</div>
            <div className={styles.group}>
              {accounts.map((account) => (
                <TimelineRow
                  key={account.id}
                  before={
                    <Avatar
                      size={40}
                      src={account.profile_image_url ?? undefined}
                      acronym={account.username.slice(0, 1).toUpperCase()}
                    />
                  }
                  title={`@${account.username}`}
                  subtitle={account.display_name ?? undefined}
                  meta={
                    <span className={styles.watchPill} data-watching={!!account.is_watching}>
                      {account.is_watching ? t('repos.watching') : t('repos.paused')}
                    </span>
                  }
                  onClick={() => navigate(`/account/${account.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.addBar}>
        <Input
          className={styles.addInput}
          placeholder={t('accounts.usernamePlaceholder')}
          value={draftUsername}
          disabled={adding}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setDraftUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Button
          size="m"
          loading={adding}
          disabled={adding || draftUsername.trim().length === 0}
          onClick={() => void handleAdd()}
        >
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}
