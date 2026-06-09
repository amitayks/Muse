import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, Toggle, ConfirmDialog, useToast } from '../components/ui';

interface AccountDetail {
  id: string;
  username: string;
  display_name: string | null;
  is_watching: number;
  config: string;
  profile_image_url: string | null;
  overview: { persona: string | null; topics: string | null; communication_style: string | null; notable_context: string | null } | null;
}

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: account, isLoading, error, refetch } = useQuery({
    queryKey: ['account', id],
    queryFn: () => api.get<AccountDetail>(`/api/v1/accounts/${id}`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put(`/api/v1/accounts/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', id] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast(t('common.saved'), 'success');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      navigate('/accounts');
    },
  });

  if (isLoading) return <PageLoading />;
  if (error || !account) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/accounts')} style={{ marginBottom: 'var(--sp-md)' }}>
        {t('common.back')}
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        {account.profile_image_url && (
          <img src={account.profile_image_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
        )}
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>@{account.username}</h1>
          {account.display_name && <div style={{ color: 'var(--hint)' }}>{account.display_name}</div>}
        </div>
        <span className={`badge ${account.is_watching ? 'badge-approved' : 'badge-draft'}`} style={{ marginInlineStart: 'auto' }}>
          {account.is_watching ? t('accounts.following') : t('accounts.unfollowed')}
        </span>
      </div>

      {/* Config */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        {/* Relevance threshold slider */}
        <div style={{ marginBottom: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-xs)' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('accounts.relevance')}</span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{config.relevanceThreshold}/10</span>
          </div>
          <input
            type="range" min="1" max="10" value={config.relevanceThreshold}
            onChange={e => updateMutation.mutate({ config: { ...config, relevanceThreshold: parseInt(e.target.value) } })}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('accounts.autoApprove')}</span>
            <Toggle checked={config.autoApprove} onChange={v => updateMutation.mutate({ config: { ...config, autoApprove: v } })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('accounts.analyzeMedia')}</span>
            <Toggle checked={config.analyzeMedia} onChange={v => updateMutation.mutate({ config: { ...config, analyzeMedia: v } })} />
          </div>
        </div>
      </div>

      {/* Persona */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-sm)' }}>{t('accounts.persona')}</div>
        {account.overview?.persona ? (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', whiteSpace: 'pre-wrap' }}>{account.overview.persona}</p>
            {account.overview.communication_style && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', marginTop: 'var(--sp-sm)' }}>
                <strong>Style:</strong> {account.overview.communication_style}
              </p>
            )}
            <button className="btn btn-outline" style={{ marginTop: 'var(--sp-sm)' }}
              onClick={() => { updateMutation.mutate({ bootstrap_persona: true }); }}>
              {t('accounts.updatePersona')}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('accounts.noPersona')}</p>
            <button className="btn btn-primary" style={{ marginTop: 'var(--sp-sm)' }}
              onClick={() => { updateMutation.mutate({ bootstrap_persona: true }); }}>
              {t('accounts.bootstrapPersona')}
            </button>
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button
          className={`btn ${account.is_watching ? 'btn-outline' : 'btn-success'}`}
          onClick={() => updateMutation.mutate({ is_watching: account.is_watching ? 0 : 1 })}
        >
          {account.is_watching ? t('accounts.unfollow') : t('accounts.follow')}
        </button>
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          {t('common.delete')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={t('accounts.confirmDelete')}
        confirmText={t('common.delete')}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
      {toastEl}
    </div>
  );
}
