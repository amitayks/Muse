/**
 * Shared component layer — the importable surface for screen agents.
 *
 * Built on telegram-ui + theme tokens; consistent across light/dark/accent automatically.
 * Screens import from here (e.g. `import { Section, Cell, StatusBadge } from '../components/shared'`).
 */
export { Section } from './Section';
export { Cell } from './Cell';
export { Spinner, PageLoading } from './Spinner';
export { EmptyState } from './EmptyState';
export { StatusBadge } from './StatusBadge';
export { Toggle } from './Toggle';
export { CharCounter } from './CharCounter';
export { PlatformTogglePill } from './PlatformTogglePill';
export { TimelineRow } from './TimelineRow';
export { ScreenScaffold } from './ScreenScaffold';

// Reused media/text components (token-driven, valid for v2).
export { AutoTextarea } from '../AutoTextarea';
export { MediaGrid } from '../MediaGrid';
export { ImageDropZone, type MediaAccept } from '../ImageDropZone';
