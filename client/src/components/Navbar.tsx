import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePointsBalance } from '../hooks/usePoints';
import { Role } from '../types/enums';
import { Badge } from './Badge';
import { Button } from './Button';
import { formatPoints } from '../utils/format';

interface NavItem {
  to: string;
  label: string;
  /** Absent means every signed-in role sees it. */
  roles?: Role[];
}

/**
 * The navigation, declared as data.
 *
 * A single list filtered by role, rather than three hand-written menus — so a screen added for one role
 * cannot accidentally appear in another's navigation, and the whole map of the application is readable
 * at a glance. Hiding a link is presentation only; the API rejects the request regardless of whether
 * the link was rendered.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/challenges', label: 'Challenges' },
  { to: '/my-challenges', label: 'Joined', roles: [Role.USER] },
  { to: '/habits', label: 'Habits', roles: [Role.USER] },
  { to: '/budget', label: 'Budget', roles: [Role.USER] },
  { to: '/expenses', label: 'Expenses', roles: [Role.USER] },
  { to: '/store', label: 'Store', roles: [Role.USER] },
  { to: '/points', label: 'Points', roles: [Role.USER] },
  { to: '/authored', label: 'My challenges', roles: [Role.CREATOR] },
  { to: '/admin/approvals', label: 'Approvals', roles: [Role.ADMIN] },
  { to: '/admin/store', label: 'Reward store', roles: [Role.ADMIN] },
];

export function Navbar() {
  const { user, isUser, logout } = useAuth();
  const navigate = useNavigate();

  if (user === null) return null;

  const items = NAV_ITEMS.filter(
    (item) => item.roles === undefined || item.roles.includes(user.role),
  );

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <NavLink to="/" className="text-forge-600 text-lg font-bold tracking-tight">
          Forge
        </NavLink>

        <nav className="flex flex-1 flex-wrap items-center gap-1" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              // `end` only on the dashboard: without it, "/" would stay highlighted on every route,
              // since every path starts with it.
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-forge-50 text-forge-700 dark:bg-forge-600/15 dark:text-forge-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {isUser && <PointsChip />}

          <div className="text-right">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {user.displayName}
            </p>
            <Badge>{user.role}</Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * The live balance, kept beside the account.
 *
 * It reads the same cached query every other screen does, so earning points anywhere in the application
 * updates it without this component knowing what happened.
 */
function PointsChip() {
  const balance = usePointsBalance();

  if (!balance.isSuccess) return null;

  return (
    <span className="bg-forge-50 text-forge-700 dark:bg-forge-600/15 dark:text-forge-400 rounded-full px-3 py-1 text-sm font-semibold">
      {formatPoints(balance.data)} pts
    </span>
  );
}
