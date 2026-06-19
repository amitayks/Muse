import { createHashRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundaryPage } from './components/ErrorBoundaryPage';
import { HomePage } from './pages/HomePage';
import { ComposerPage } from './pages/ComposerPage';
import { DraftsHubPage } from './pages/DraftsHubPage';
import { DraftsListPage } from './pages/DraftsListPage';
import { ReposPage } from './pages/ReposPage';
import { RepoDetailPage } from './pages/RepoDetailPage';
import { AccountsPage } from './pages/AccountsPage';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { SkillsPage } from './pages/SkillsPage';

export const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundaryPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/compose', element: <ComposerPage /> },
      { path: '/draft/:id', element: <ComposerPage /> },
      { path: '/drafts', element: <DraftsHubPage /> },
      { path: '/drafts/source/:source', element: <DraftsListPage /> },
      { path: '/drafts/:status', element: <DraftsListPage /> },
      { path: '/repos', element: <ReposPage /> },
      { path: '/repo/:id', element: <RepoDetailPage /> },
      { path: '/accounts', element: <AccountsPage /> },
      { path: '/account/:id', element: <AccountDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/skills', element: <SkillsPage /> },
      { path: '*', element: <HomePage /> },
    ],
  },
]);
