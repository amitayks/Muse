import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { LangContext, type Lang } from './i18n';
import { initTelegram, isInTelegram, getTelegramLanguage } from './lib/telegram';
import { NotInTelegram } from './components/NotInTelegram';
import { SessionExpiredBanner } from './components/SessionExpiredBanner';
import './styles/theme.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});

function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [inTelegram, setInTelegram] = useState(true);

  useEffect(() => {
    initTelegram();
    const tgLang = getTelegramLanguage();
    setLang(tgLang);
    document.documentElement.dir = tgLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = tgLang;

    if (!isInTelegram() && !import.meta.env.DEV) {
      setInTelegram(false);
    }
  }, []);

  if (!inTelegram) {
    return (
      <LangContext.Provider value={lang}>
        <NotInTelegram />
      </LangContext.Provider>
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <QueryClientProvider client={queryClient}>
        <SessionExpiredBanner />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
