import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/AppLayout';
import { RequireRole } from './components/RequireRole';
import { AuthProvider } from './context/AuthContext';
import { AdminStorePage } from './pages/AdminStorePage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AuthoredChallengesPage } from './pages/AuthoredChallengesPage';
import { BudgetPage } from './pages/BudgetPage';
import { ChallengeDetailPage } from './pages/ChallengeDetailPage';
import { ChallengeEditorPage } from './pages/ChallengeEditorPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { HabitsPage } from './pages/HabitsPage';
import { JoinedChallengesPage } from './pages/JoinedChallengesPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { PointsPage } from './pages/PointsPage';
import { RegisterPage } from './pages/RegisterPage';
import { StorePage } from './pages/StorePage';
import { ApiError } from './services/api';
import { Role } from './types/enums';

/**
 * Query defaults, chosen once.
 *
 * The retry rule is the one worth reading: a 4xx is the server's considered answer, and asking the same
 * question twice gets the same answer while making a rejection feel like a hang. Only the failures that
 * might genuinely be transient — a network drop, a 5xx — are worth another attempt.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // A mutation is not safe to repeat blind: a retried check-in or redemption is a second attempt at
      // spending or earning. The server's unique constraints would reject the duplicate, but the right
      // place to stop it is here, by not sending it.
      retry: false,
    },
  },
});

/**
 * Composes the providers and declares the routes. No business logic lives here.
 *
 * Route groups are wrapped in `RequireRole`, so each group states its audience once instead of every
 * page checking for itself. These guards decide what is worth rendering — the API independently
 * enforces the same rules, and typing a URL directly reaches a server that says no.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Every signed-in role. */}
            <Route element={<RequireRole />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="challenges" element={<ChallengesPage />} />
                <Route path="challenges/:id" element={<ChallengeDetailPage />} />

                {/* Users: habits, money, and the store are private to their owner. */}
                <Route element={<RequireRole allow={[Role.USER]} />}>
                  <Route path="habits" element={<HabitsPage />} />
                  <Route path="budget" element={<BudgetPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route path="store" element={<StorePage />} />
                  <Route path="points" element={<PointsPage />} />
                  <Route path="my-challenges" element={<JoinedChallengesPage />} />
                </Route>

                {/* Creators: their own challenges, and only their own participants. */}
                <Route element={<RequireRole allow={[Role.CREATOR]} />}>
                  <Route path="authored" element={<AuthoredChallengesPage />} />
                  <Route path="authored/new" element={<ChallengeEditorPage />} />
                  <Route path="authored/:id/edit" element={<ChallengeEditorPage />} />
                  <Route path="authored/:id/participants" element={<ParticipantsPage />} />
                </Route>

                {/* Admins: approval and the reward store. */}
                <Route element={<RequireRole allow={[Role.ADMIN]} />}>
                  <Route path="admin/approvals" element={<ApprovalsPage />} />
                  <Route path="admin/store" element={<AdminStorePage />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
