import { type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, Package, User, Settings, Video } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import './Layout.css';

interface NavItem {
  key: string;
  path: string;
  icon: ReactNode;
}

const ICON_SIZE = 20;

const NAV_ITEMS: NavItem[] = [
  { key: 'home', path: '/', icon: <Home size={ICON_SIZE} /> },
  { key: 'drafts', path: '/drafts', icon: <FileText size={ICON_SIZE} /> },
  { key: 'repos', path: '/repos', icon: <Package size={ICON_SIZE} /> },
  { key: 'accounts', path: '/accounts', icon: <User size={ICON_SIZE} /> },
  { key: 'settings', path: '/settings', icon: <Settings size={ICON_SIZE} /> },
];

export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const currentPath = location.pathname;

  const items = [...NAV_ITEMS];
  if (isAdmin) {
    items.push({ key: 'videoStudio', path: '/videos', icon: <Video size={ICON_SIZE} /> });
  }

  function isActive(path: string): boolean {
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path);
  }

  return (
    <div className="layout">
      <main className="layout-content">
        <Outlet />
      </main>
      <nav className="layout-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${isActive(item.path) ? 'nav-item--active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{t(`nav.${item.key}`)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
