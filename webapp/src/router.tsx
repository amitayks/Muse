import { createHashRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundaryPage } from './components/ErrorBoundaryPage';
import { DashboardPage } from './pages/DashboardPage';
import { DraftsListPage } from './pages/DraftsListPage';
import { DraftEditorPage } from './pages/DraftEditorPage';
import { ComposePage } from './pages/ComposePage';
import { GeneratePage } from './pages/GeneratePage';
import { RepostPage } from './pages/RepostPage';
import { ReposListPage } from './pages/ReposListPage';
import { RepoDetailPage } from './pages/RepoDetailPage';
import { AccountsListPage } from './pages/AccountsListPage';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { VideoStudioPage } from './pages/VideoStudioPage';
import { PromptEditorPage } from './pages/PromptEditorPage';
import { AdminPromptEditorPage } from './pages/AdminPromptEditorPage';

export const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundaryPage />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/drafts', element: <DraftsListPage /> },
      { path: '/draft/:id', element: <DraftEditorPage /> },
      { path: '/compose', element: <ComposePage /> },
      { path: '/generate', element: <GeneratePage /> },
      { path: '/repost', element: <RepostPage /> },
      { path: '/repos', element: <ReposListPage /> },
      { path: '/repo/:id', element: <RepoDetailPage /> },
      { path: '/accounts', element: <AccountsListPage /> },
      { path: '/account/:id', element: <AccountDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/prompts', element: <PromptEditorPage /> },
      { path: '/settings/admin-prompts', element: <AdminPromptEditorPage /> },
      { path: '/videos', element: <VideoStudioPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
]);
