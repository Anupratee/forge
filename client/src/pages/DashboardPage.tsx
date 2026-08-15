import { useAuth } from '../hooks/useAuth';
import { Loading } from '../components/Loading';
import { Role } from '../types/enums';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { CreatorDashboard } from './dashboards/CreatorDashboard';
import { UserDashboard } from './dashboards/UserDashboard';

/**
 * Picks the dashboard for the signed-in role.
 *
 * The three are genuinely different screens rather than one screen with sections switched off — they
 * read different endpoints and answer different questions, and a shared component full of role
 * conditionals would be harder to follow and easier to leak through.
 *
 * `useAuth` is the only thing consulted, keeping role knowledge in the two places it belongs.
 */
export function DashboardPage() {
  const { user } = useAuth();

  // `RequireRole` has already established a session before this renders; this is for the type.
  if (user === null) return <Loading label="Loading your dashboard" />;

  switch (user.role) {
    case Role.ADMIN:
      return <AdminDashboard />;
    case Role.CREATOR:
      return <CreatorDashboard />;
    case Role.USER:
      return <UserDashboard />;
  }
}
