import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { useSignal } from '@telegram-apps/sdk-react';
import { router } from './router';
import { LangContext } from './i18n';
import { isInTelegram, getTelegramLanguage, signals, MiniApp } from './lib/telegram';
import { TelegramChromeProvider } from './shell';
import { NotInTelegram } from './components/NotInTelegram';
import { SessionExpiredBanner } from './components/SessionExpiredBanner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Telegram webviews fire window focus/visibility events constantly (keyboard open/close,
      // taps, popups), so focus-refetch causes spurious app-wide refetches that flash like a
      // reload. Data is invalidated explicitly after mutations instead.
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});

export function App() {
  // initTelegram() already ran before React mounted, so the language is available synchronously
  // on first render — compute it lazily instead of syncing it in via an effect.
  const [lang] = useState(() => getTelegramLanguage());
  const [inTelegram] = useState(() => isInTelegram() || import.meta.env.DEV);

  // Reactive color scheme — drives the kit's light/dark appearance without a reload.
  const isDark = useSignal(signals.isDark);

  // DOM direction/lang are external-system state, the legitimate use of an effect.
  useEffect(() => {
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Keep the native header/background bound to the theme bg, and re-bind when the user flips
  // light/dark so the Telegram chrome re-matches the new surface without a reload.
  useEffect(() => {
    MiniApp.bindThemeColors();
  }, [isDark]);

  if (!inTelegram) {
    return (
      <LangContext.Provider value={lang}>
        <AppRoot appearance="light" className="tgui-root">
          <NotInTelegram />
        </AppRoot>
      </LangContext.Provider>
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <AppRoot appearance={isDark ? 'dark' : 'light'} className="tgui-root">
        <QueryClientProvider client={queryClient}>
          <TelegramChromeProvider>
            <SessionExpiredBanner />
            <RouterProvider router={router} />
          </TelegramChromeProvider>
        </QueryClientProvider>
      </AppRoot>
    </LangContext.Provider>
  );
}
