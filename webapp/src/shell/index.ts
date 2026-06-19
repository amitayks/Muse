/** Shell / native-chrome public surface for screens. */
export { TelegramChromeProvider } from './TelegramChromeProvider';
export { useChrome, type MainButtonConfig, type SecondaryButtonConfig } from './chromeContext';
export { useMainButton } from './useMainButton';
export { useSecondaryButton } from './useSecondaryButton';
export { useBackButton } from './useBackButton';
export { useSettingsButton } from './useSettingsButton';
export {
  confirm,
  confirmDestructive,
  popup,
  notifySuccess,
  notifyError,
  haptics,
  type PopupParams,
  type PopupButton,
} from './feedback';
