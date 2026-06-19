import { Switch } from '@telegram-apps/telegram-ui';
import { haptics } from '../../shell/feedback';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Native theme-driven switch (telegram-ui `Switch`) with a selection haptic on change.
 * Drop into a <Cell after={<Toggle .../>}> to make a settings row.
 */
export function Toggle({ checked, onChange, disabled }: Props) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onChange={(e) => {
        haptics.selectionChanged();
        onChange(e.target.checked);
      }}
    />
  );
}
