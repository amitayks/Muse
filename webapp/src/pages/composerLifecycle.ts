/**
 * Composer / Draft-viewer lifecycle state machine (co-located helper for ComposerPage).
 *
 * Derives a single `mode` from the draft's source/status plus the active toggles, and the
 * MainButton intent (Save → Generate → Approve → Publish) from it. Keeping this pure makes the
 * Composer's morph-in-place behavior testable and easy to read.
 */

import type { Draft, DraftStatus } from '../types/draft';

export type ComposerMode =
  | 'composing'    // new handwrite, no draft yet → Save
  | 'pre-generate' // seeded from a commit, no draft yet → Generate
  | 'draft'        // saved/generated, status draft → Approve
  | 'approved'     // approved → Publish
  | 'scheduled'    // scheduled → Publish (+ unschedule)
  | 'publishing'   // publish kicked off, awaiting pipeline → read-only-ish
  | 'published';   // terminal, read-only with results/links

export type PrimaryActionKind = 'save' | 'generate' | 'approve' | 'publish' | 'none';

export interface Lifecycle {
  mode: ComposerMode;
  /** What the system MainButton should do in this mode. */
  primaryAction: PrimaryActionKind;
  /** i18n key for the MainButton label. */
  primaryLabelKey: string;
  /** Tweet text/media editable in this mode. */
  canEdit: boolean;
  /** Existing-draft chrome (platforms, top action row, full media). */
  isExistingDraft: boolean;
  /** Show the top action row (delete · schedule · refine). */
  showActions: boolean;
  /** Show the bottom platform self-toggle pills. */
  showPlatforms: boolean;
  /** Show the customize row ([+ commit] · ai · image · language). */
  showCustomize: boolean;
  /** Show published per-platform results / links. */
  showResults: boolean;
}

/**
 * Resolve the lifecycle from the current draft (null until first save/generate) and whether a
 * generation source (commit OR repost) is attached in the pre-draft phase.
 */
export function resolveLifecycle(
  draft: Draft | null,
  hasGenerateSource: boolean,
): Lifecycle {
  // Pre-draft phase: nothing persisted yet.
  if (!draft) {
    const mode: ComposerMode = hasGenerateSource ? 'pre-generate' : 'composing';
    return {
      mode,
      primaryAction: hasGenerateSource ? 'generate' : 'save',
      primaryLabelKey: hasGenerateSource ? 'composer.generate' : 'composer.save',
      canEdit: true,
      isExistingDraft: false,
      showActions: false,
      showPlatforms: false,
      showCustomize: true,
      showResults: false,
    };
  }

  const status: DraftStatus = draft.status;

  switch (status) {
    case 'draft':
      return base('draft', 'approve', 'composer.approve', {
        canEdit: true,
        showActions: true,
        showPlatforms: true,
        showCustomize: false,
        showResults: false,
      });
    case 'approved':
      return base('approved', 'publish', 'composer.publish', {
        canEdit: true,
        showActions: true,
        showPlatforms: true,
        showCustomize: false,
        showResults: false,
      });
    case 'scheduled':
      return base('scheduled', 'publish', 'composer.publishNow', {
        canEdit: true,
        showActions: true,
        showPlatforms: true,
        showCustomize: false,
        showResults: false,
      });
    case 'publishing':
      return base('publishing', 'none', 'composer.publish', {
        canEdit: false,
        showActions: false,
        showPlatforms: true,
        showCustomize: false,
        showResults: true,
      });
    case 'published':
      return base('published', 'none', 'composer.publish', {
        canEdit: false,
        showActions: false,
        showPlatforms: false,
        showCustomize: false,
        showResults: true,
      });
    default:
      // Unknown status — treat as a read-only existing draft.
      return base('draft', 'none', 'composer.approve', {
        canEdit: false,
        showActions: false,
        showPlatforms: true,
        showCustomize: false,
        showResults: false,
      });
  }
}

function base(
  mode: ComposerMode,
  primaryAction: PrimaryActionKind,
  primaryLabelKey: string,
  flags: {
    canEdit: boolean;
    showActions: boolean;
    showPlatforms: boolean;
    showCustomize: boolean;
    showResults: boolean;
  },
): Lifecycle {
  return {
    mode,
    primaryAction,
    primaryLabelKey,
    isExistingDraft: true,
    ...flags,
  };
}
