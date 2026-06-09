import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, EmptyState, useToast } from '../components/ui';
import { User } from 'lucide-react';

interface Account {
  id: string;
  username: string;
  display_name: string | null;
  is_watching: number;
  config: string;
  profile_image_url: string | null;
}

export function AccountsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<{ accounts: Account[] }>('/api/v1/accounts'),
  });

  const addMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; id: string }>('/api/v1/accounts', { username: newUsername.trim().replace(/^@/, '') }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setNewUsername('');
      setShowAdd(false);
      showToast('Account added', 'success');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  const accounts = data?.accounts ?? [];

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-lg)' }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>{t('accounts.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>+ {t('accounts.addAccount')}</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
          <input
            type="text"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            placeholder={t('accounts.usernamePlaceholder')}
            style={{
              width: '100%', padding: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 'var(--text-base)', fontFamily: 'var(--font)', outline: 'none',
            }}
          />
          <button className="btn btn-success" onClick={() => addMutation.mutate()} disabled={!newUsername.trim() || addMutation.isPending}>
            {t('accounts.addAccount')}
          </button>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState icon={<User size={40} />} title={t('accounts.noAccounts')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {accounts.map(account => (
            <div key={account.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/account/${account.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                {account.profile_image_url && (
                  <img src={account.profile_image_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>@{account.username}</div>
                  {account.display_name && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)' }}>{account.display_name}</div>}
                </div>
                <span className={`badge ${account.is_watching ? 'badge-approved' : 'badge-draft'}`}>
                  {account.is_watching ? t('accounts.following') : t('accounts.unfollowed')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {toastEl}
    </div>
  );
}
