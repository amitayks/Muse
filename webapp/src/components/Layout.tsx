import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, Package, User, Settings } from 'lucide-react';
import { Tabbar } from '@telegram-apps/telegram-ui';
import { useTranslation } from '../i18n';
import { haptics } from '../shell/feedback';
import styles from './Layout.module.css';

const ICON_SIZE = 22;

interface NavItem {
  key: string;
  path: string;
  icon: typeof Home;
}

/** Top-level tabbed screens. No Video Studio item. */
const NAV_ITEMS: NavItem[] = [
  { key: 'home', path: '/', icon: Home },
  { key: 'drafts', path: '/drafts', icon: FileText },
  { key: 'repos', path: '/repos', icon: Package },
  { key: 'accounts', path: '/accounts', icon: User },
  { key: 'settings', path: '/settings', icon: Settings },
];

/**
 * The exact top-level route prefixes that show the Tabbar. Every other route is a flow/detail
 * screen which hides the Tabbar and relies on the system BackButton (bound via useBackButton).
 *
 * Note `/drafts` is top-level but `/drafts/:status` is also a tabbed list — both keep the Tabbar.
 * `/settings/skills` is a sub-page → Tabbar hidden.
 */
function isTopLevelRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname === '/drafts' || pathname.startsWith('/drafts/')) return true;
  if (pathname === '/repos') return true;
  if (pathname === '/accounts') return true;
  if (pathname === '/settings') return true;
  return false;
}

function activeKey(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/drafts')) return 'drafts';
  if (pathname.startsWith('/repos') || pathname.startsWith('/repo/')) return 'repos';
  if (pathname.startsWith('/accounts') || pathname.startsWith('/account/')) return 'accounts';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
}

export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const showTabbar = isTopLevelRoute(location.pathname);
  const current = activeKey(location.pathname);
  // "Fill" screens manage their own internal scroll and pin a footer above the tabbar
  // (Home: timeline + compose bar; Repos: list + search bar; Accounts: list + add bar).
  const isFill =
    location.pathname === '/' ||
    location.pathname === '/repos' ||
    location.pathname === '/accounts' ||
    location.pathname === '/settings/skills';

  return (
    <div className={styles.layout}>
      <main
        className={styles.content}
        data-with-tabbar={showTabbar || undefined}
        data-fill={isFill || undefined}
      >
        <Outlet />
      </main>
      {showTabbar && (
        <Tabbar className={styles.tabbar}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Tabbar.Item
                key={item.key}
                aria-label={t(`nav.${item.key}`)}
                selected={current === item.key}
                onClick={() => {
                  haptics.selectionChanged();
                  navigate(item.path);
                }}
              >
                <Icon size={ICON_SIZE} />
              </Tabbar.Item>
            );
          })}
        </Tabbar>
      )}
    </div>
  );
}
