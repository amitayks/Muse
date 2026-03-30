import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, ConfirmDialog, useToast, Spinner } from '../components/ui';
import { Bell } from 'lucide-react';

interface PromptStatus {
  type: string;
  content: string;
  isCustom: boolean;
  isStale: boolean;
  defaultVersion: number;
  basedOnVersion: number;
}

interface PromptsResponse {
  prompts: PromptStatus[];
  staleCount: number;
}

const PROMPT_LABELS: Record<string, string> = {
  'work-progress': 'Tweet Generation',
  'refine': 'Tweet Refinement',
  'quote': 'Quote Tweet',
  'identity': 'My Identity',
  'thumbnail': 'Thumbnail',
};

export function PromptEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [activeTab, setActiveTab] = useState('work-progress');
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api.get<PromptsResponse>('/api/v1/prompts'),
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) => api.put(`/api/v1/prompts/${activeTab}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setEditedContent(null);
      showToast(t('common.saved'), 'success');
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.delete<{ success: boolean; content: string }>(`/api/v1/prompts/${activeTab}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setEditedContent(null);
      setConfirmReset(false);
      showToast('Reset to default', 'success');
    },
  });

  if (isLoading) return <PageLoading />;
  if (error || !data) return <ErrorBanner message={t('common.error')} onRetry={() => refetch()} />;

  const activePrompt = data.prompts.find(p => p.type === activeTab);
  const currentContent = editedContent ?? activePrompt?.content ?? '';

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/settings')} style={{ marginBottom: 'var(--sp-md)' }}>
        {t('common.back')}
      </button>

      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-md)' }}>{t('settings.systemPrompts')}</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)', overflowX: 'auto', marginBottom: 'var(--sp-lg)', paddingBottom: 'var(--sp-xs)' }}>
        {data.prompts.map(p => (
          <button
            key={p.type}
            onClick={() => { setActiveTab(p.type); setEditedContent(null); }}
            style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: activeTab === p.type ? 'var(--btn)' : 'var(--bg-secondary)',
              color: activeTab === p.type ? 'var(--btn-text)' : 'var(--text)',
              fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            {PROMPT_LABELS[p.type] || p.type}
            {p.isStale && <Bell size={14} />}
          </button>
        ))}
      </div>

      {/* Status badges */}
      {activePrompt && (
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
          <span className={`badge ${activePrompt.isCustom ? 'badge-approved' : 'badge-draft'}`}>
            {activePrompt.isCustom ? 'Custom' : 'Default'}
          </span>
          {activePrompt.isStale && (
            <span className="badge badge-publishing">Stale — default has been updated</span>
          )}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={currentContent}
        onChange={e => setEditedContent(e.target.value)}
        rows={15}
        style={{
          width: '100%', padding: 'var(--sp-md)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--text)',
          fontSize: 'var(--text-sm)', fontFamily: 'monospace',
          resize: 'vertical', outline: 'none', lineHeight: 1.5,
        }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)' }}>
        <button
          className="btn btn-success"
          onClick={() => saveMutation.mutate(currentContent)}
          disabled={!editedContent || saveMutation.isPending}
        >
          {saveMutation.isPending ? <Spinner size={14} /> : t('common.save')}
        </button>
        {activePrompt?.isCustom && (
          <button className="btn btn-outline" onClick={() => setConfirmReset(true)}>
            Reset to Default
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        message="Reset this prompt to the default version? Your custom changes will be lost."
        confirmText="Reset"
        onConfirm={() => resetMutation.mutate()}
        onCancel={() => setConfirmReset(false)}
      />
      {toastEl}
    </div>
  );
}
