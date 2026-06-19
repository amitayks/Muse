import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { SegmentedControl, Button } from '@telegram-apps/telegram-ui';
import { Section, Cell, PageLoading } from '../components/shared';
import { useBackButton, useMainButton, confirm, notifySuccess, notifyError, haptics } from '../shell';
import { ApiError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import {
  USER_SKILLS,
  ADMIN_SKILLS,
  fetchUserPrompt,
  fetchUserDefault,
  saveUserPrompt,
  resetUserPrompt,
  acknowledgePrompt,
  fetchAdminPrompt,
  saveAdminPrompt,
  pushAdminPrompt,
  type SkillType,
  type SkillLang,
  type SkillMeta,
} from './skills/skills';
import styles from './SkillsPage.module.css';

type Scope = 'user' | 'admin';

/**
 * Settings → Skills (`/settings/skills`). In-app replacement for the standalone HTML prompt
 * editors. Flow screen: BackButton returns to the skill list (or to Settings when the list is
 * shown); the system MainButton is the primary Save action while a skill is open.
 *
 * Per-language (en/he) editing with per-skill read/edit + reset-to-default and a stale-prompt
 * warning ([View Default] / [Update to New] / [Keep Mine]). Admins additionally get a global
 * editor over all skills that can push a new default to users. All persistence goes through the
 * existing prompt API; drafts are untouched.
 */
export function SkillsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const [scope, setScope] = useState<Scope>('user');
  const [lang, setLang] = useState<SkillLang>('en');
  const [openType, setOpenType] = useState<SkillType | null>(null);

  const skills = scope === 'admin' ? ADMIN_SKILLS : USER_SKILLS;
  const openSkill = useMemo(
    () => skills.find((s) => s.type === openType) ?? null,
    [skills, openType],
  );

  // BackButton: collapse the editor back to the list first; otherwise default (navigate -1).
  const handleBack = useCallback(() => {
    setOpenType(null);
  }, []);
  useBackButton(openSkill ? handleBack : undefined);

  // Switching scope or closing must not leave a stale-open skill that the other scope lacks.
  const handleScopeChange = useCallback((next: Scope) => {
    setScope(next);
    setOpenType(null);
  }, []);

  if (openSkill) {
    return (
      <SkillEditor
        key={`${scope}:${openSkill.type}:${lang}`}
        scope={scope}
        skill={openSkill}
        lang={lang}
        onClose={() => setOpenType(null)}
      />
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.controls}>
        {isAdmin && (
          <SegmentedControl>
            <SegmentedControl.Item
              selected={scope === 'user'}
              onClick={() => handleScopeChange('user')}
            >
              {t('settings.systemPrompts')}
            </SegmentedControl.Item>
            <SegmentedControl.Item
              selected={scope === 'admin'}
              onClick={() => handleScopeChange('admin')}
            >
              {t('settings.adminPrompts')}
            </SegmentedControl.Item>
          </SegmentedControl>
        )}

        <SegmentedControl>
          <SegmentedControl.Item selected={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </SegmentedControl.Item>
          <SegmentedControl.Item selected={lang === 'he'} onClick={() => setLang('he')}>
            HE
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>

      <Section
        header={scope === 'admin' ? t('settings.adminPrompts') : t('settings.systemPrompts')}
      >
        {skills.map((skill) => (
          <Cell
            key={skill.type}
            interactive
            onClick={() => {
              haptics.selectionChanged();
              setOpenType(skill.type);
            }}
            subtitle={skill.description}
          >
            {skill.label}
          </Cell>
        ))}
      </Section>
    </div>
  );
}

// ==================== EDITOR ====================

interface EditorProps {
  scope: Scope;
  skill: SkillMeta;
  lang: SkillLang;
  onClose: () => void;
}

const promptKey = (scope: Scope, type: SkillType, lang: SkillLang) =>
  ['prompt', scope, type, lang] as const;

function SkillEditor({ scope, skill, lang, onClose }: EditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { type } = skill;

  // The edit buffer is tagged with the loaded value it was seeded from. When a fresh value
  // arrives from the query, the buffer is implicitly re-seeded during render (no effect), which
  // also clears the preview/stale-dismissal that belonged to the previous value.
  const [edit, setEdit] = useState<{ seed: string; value: string } | null>(null);
  // null = no preview; string = resolved default shown in the preview box.
  const [defaultPreview, setDefaultPreview] = useState<string | null>(null);
  // Dismissed locally so the stale banner hides immediately after Keep Mine / Update to New.
  const [staleDismissed, setStaleDismissed] = useState(false);

  const query = useQuery({
    queryKey: promptKey(scope, type, lang),
    queryFn: () => (scope === 'admin' ? fetchAdminPrompt(type, lang) : fetchUserPrompt(type, lang)),
    staleTime: 0,
  });

  const loadedContent = query.data?.content;
  // Re-seed when a new loaded value differs from the one the buffer was seeded from.
  if (loadedContent !== undefined && (edit === null || edit.seed !== loadedContent)) {
    setEdit({ seed: loadedContent, value: loadedContent });
    if (staleDismissed) setStaleDismissed(false);
    if (defaultPreview !== null) setDefaultPreview(null);
  }
  const content = edit?.value ?? '';
  const setContent = useCallback(
    (value: string) => setEdit((prev) => ({ seed: prev?.seed ?? value, value })),
    [],
  );

  const data = query.data;
  const showStale = scope === 'user' && !!data?.isStale && !staleDismissed;

  // BackButton (collapse to list) is owned by the parent; here we drive the MainButton (Save).
  const saveMutation = useMutation({
    mutationFn: (value: string) =>
      scope === 'admin'
        ? saveAdminPrompt(type, lang, value)
        : saveUserPrompt(type, lang, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: promptKey(scope, type, lang) });
      await queryClient.invalidateQueries({ queryKey: ['prompts-stale'] });
      await notifySuccess(t('common.saved'));
      onClose();
    },
    onError: (err) => {
      notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetUserPrompt(type, lang),
    onSuccess: async (res) => {
      setContent(res.content);
      setStaleDismissed(true);
      setDefaultPreview(null);
      await queryClient.invalidateQueries({ queryKey: promptKey(scope, type, lang) });
      await queryClient.invalidateQueries({ queryKey: ['prompts-stale'] });
      haptics.notification('success');
    },
    onError: (err) => {
      notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => acknowledgePrompt(type, lang),
    onSuccess: async () => {
      setStaleDismissed(true);
      await queryClient.invalidateQueries({ queryKey: promptKey(scope, type, lang) });
      await queryClient.invalidateQueries({ queryKey: ['prompts-stale'] });
    },
    onError: (err) => {
      notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const pushMutation = useMutation({
    mutationFn: (value: string) => pushAdminPrompt(type, lang, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: promptKey(scope, type, lang) });
      await notifySuccess(t('skills.pushed'));
      onClose();
    },
    onError: (err) => {
      notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const trimmed = content.trim();
  const canSave =
    trimmed.length > 0 && !saveMutation.isPending && !pushMutation.isPending && !query.isLoading;

  const handleSave = useCallback(() => {
    if (trimmed.length === 0) return;
    haptics.impact('medium');
    saveMutation.mutate(content);
  }, [content, trimmed.length, saveMutation]);

  // Primary action = Save, bound to the system MainButton.
  useMainButton({
    text: t('common.save'),
    onClick: handleSave,
    enabled: canSave,
    loading: saveMutation.isPending,
  });

  const handleViewDefault = useCallback(async () => {
    haptics.selectionChanged();
    try {
      const res = await fetchUserDefault(type, lang);
      setDefaultPreview(res.content);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }, [type, lang, t]);

  const handleUpdateToNew = useCallback(() => {
    haptics.impact('medium');
    resetMutation.mutate();
  }, [resetMutation]);

  const handleKeepMine = useCallback(() => {
    haptics.selectionChanged();
    acknowledgeMutation.mutate();
  }, [acknowledgeMutation]);

  const handleReset = useCallback(async () => {
    const ok = await confirm(t('skills.resetConfirm'));
    if (!ok) return;
    resetMutation.mutate();
  }, [resetMutation, t]);

  const handlePush = useCallback(async () => {
    if (trimmed.length === 0) return;
    const ok = await confirm(t('skills.pushConfirm'));
    if (!ok) return;
    haptics.impact('medium');
    pushMutation.mutate(content);
  }, [content, trimmed.length, pushMutation, t]);

  if (query.isLoading) {
    return <PageLoading />;
  }

  if (query.isError) {
    return (
      <div className={styles.errorBox}>
        <span className={styles.errorText}>
          {query.error instanceof ApiError ? query.error.message : t('common.error')}
        </span>
        <Button mode="bezeled" size="m" onClick={() => query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <span className={styles.editorTitle}>{skill.label}</span>
        <span className={styles.editorDescription}>{skill.description}</span>
      </div>

      {type === 'identity' && scope === 'user' && (
        <div className={styles.identityHint}>{t('skills.identityHint')}</div>
      )}

      {showStale && (
        <Section header={t('skills.staleTitle')}>
          <Cell subtitle={t('skills.staleDescription')}>{t('skills.staleHeader')}</Cell>
          <div className={styles.staleActions}>
            <Button mode="bezeled" size="s" onClick={handleViewDefault}>
              {t('skills.viewDefault')}
            </Button>
            <Button
              mode="filled"
              size="s"
              loading={resetMutation.isPending}
              onClick={handleUpdateToNew}
            >
              {t('skills.updateToNew')}
            </Button>
            <Button
              mode="plain"
              size="s"
              loading={acknowledgeMutation.isPending}
              onClick={handleKeepMine}
            >
              {t('skills.keepMine')}
            </Button>
          </div>
        </Section>
      )}

      {defaultPreview !== null && (
        <div className={styles.defaultPreview}>
          <span className={styles.defaultPreviewHeader}>{t('skills.currentDefault')}</span>
          <div className={styles.defaultPreviewBody} dir="auto">
            {defaultPreview}
          </div>
          <Button mode="plain" size="s" onClick={() => setDefaultPreview(null)}>
            {t('common.close')}
          </Button>
        </div>
      )}

      <textarea
        className={styles.textarea}
        value={content}
        dir="auto"
        spellCheck={false}
        disabled={saveMutation.isPending || pushMutation.isPending}
        placeholder={t('skills.promptPlaceholder')}
        onChange={(e) => setContent(e.target.value)}
      />

      <div className={styles.actions}>
        {scope === 'user' ? (
          <Button
            mode="bezeled"
            size="m"
            stretched
            loading={resetMutation.isPending}
            disabled={!data?.isCustom || resetMutation.isPending}
            onClick={handleReset}
          >
            {t('skills.resetToDefault')}
          </Button>
        ) : (
          <Button
            mode="bezeled"
            size="m"
            stretched
            loading={pushMutation.isPending}
            disabled={trimmed.length === 0 || pushMutation.isPending}
            onClick={handlePush}
          >
            {t('skills.saveAndPush')}
          </Button>
        )}
      </div>
    </div>
  );
}
