import type { ReactNode } from 'react';
import { Placeholder } from '@telegram-apps/telegram-ui';

interface Props {
  /** Optional leading icon/illustration. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional action node (e.g. a Button). */
  action?: ReactNode;
}

/**
 * Centered empty/zero state built on telegram-ui `Placeholder`.
 * Use when a list or screen has no content yet.
 */
export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <Placeholder header={title} description={description} action={action}>
      {icon}
    </Placeholder>
  );
}
