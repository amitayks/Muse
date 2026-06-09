import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { PageLoading, ErrorBanner, EmptyState, useToast, Spinner } from '../components/ui';
import { Lock } from 'lucide-react';

const ALL_PROMPT_TYPES = [
  'work-progress', 'refine', 'quote', 'video',
  'know-my-project', 'persona', 'what-i-like', 'who-am-i', 'identity', 'image-gen',
];

const PROMPT_LABELS: Record<string, string> = {
  'work-progress': 'Tweet Generation',
  'refine': 'Tweet Refinement',
  'quote': 'Quote Tweet',
  'video': 'Video Script',
  'know-my-project': 'Know My Project',
  'persona': 'Persona Analysis',
  'what-i-like': 'What I Like',
  'who-am-i': 'Who Am I',
  'identity': 'Identity',
  'image-gen': 'Image Generation',
};

export function AdminPromptEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [selectedType, setSelectedType] = useState('work-progress');
  const [editedContent, setEditedContent] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <EmptyState icon={<Lock size={40} />} title="Access Denied" description="Admin prompts are only available for admin users."
        action={<button className="btn btn-primary" onClick={() => navigate('/settings')}>Back to Settings</button>} />
    );
  }

  const { data: promptData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-prompt', selectedType],
    queryFn: () => api.get<{ type: string; content: string }>(`/api/v1/prompts/${selectedType}`),
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) => api.put(`/api/v1/prompts/${selectedType}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompt', selectedType] });
      setEditedContent(null);
      showToast(t('common.saved'), 'success');
    },
  });

  const currentContent = editedContent ?? promptData?.content ?? '';

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/settings')} style={{ marginBottom: 'var(--sp-md)' }}>
        {t('common.back')}
      </button>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-md)' }}>{t('settings.adminPrompts')}</h1>

      {/* Type selector */}
      <select
        value={selectedType}
        onChange={e => { setSelectedType(e.target.value); setEditedContent(null); }}
        style={{
          width: '100%', padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--text)', fontSize: 'var(--text-base)', fontFamily: 'var(--font)',
        }}
      >
        {ALL_PROMPT_TYPES.map(type => (
          <option key={type} value={type}>{PROMPT_LABELS[type] || type}</option>
        ))}
      </select>

      {isLoading ? <PageLoading /> : error ? <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} /> : (
        <>
          <textarea
            value={currentContent}
            onChange={e => setEditedContent(e.target.value)}
            rows={18}
            style={{
              width: '100%', padding: 'var(--sp-md)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text)',
              fontSize: 'var(--text-sm)', fontFamily: 'monospace',
              resize: 'vertical', outline: 'none', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)' }}>
            <button className="btn btn-success" onClick={() => saveMutation.mutate(currentContent)} disabled={!editedContent || saveMutation.isPending}>
              {saveMutation.isPending ? <Spinner size={14} /> : 'Save (Personal)'}
            </button>
          </div>
        </>
      )}

      {toastEl}
    </div>
  );
}
