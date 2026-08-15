import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Role } from '../types/enums';
import { Loading } from './Loading';

/**
 * Route guard. The only place besides `useAuth` that branches on a role.
 *
 * **This is user experience, not security.** It decides which screens are worth rendering; it does not
 * decide what anyone may do. Every protected endpoint re-checks the caller's role and ownership on the
 * server, and the Phase 8 tests assert the API rejects each forbidden role directly — so removing this
 * component entirely would make the app unpleasant, not insecure.
 *
 * Used as a layout route wrapping the screens it protects, so the check is declared once per group
 * rather than repeated in every page component.
 */
export function RequireRole({ allow }: { allow?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  // Still confirming a stored token. Redirecting now would sign out anyone who refreshed the page.
  if (status === 'loading') {
    return <Loading label="Checking your session" />;
  }

  if (status === 'anonymous' || user === null) {
    // `state` carries where they were headed, so signing in returns them there instead of dumping
    // everyone on the same landing page.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // No `allow` list means "any signed-in role", which is a real case — browsing challenges, for one.
  if (allow !== undefined && !allow.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
