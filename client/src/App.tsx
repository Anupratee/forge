/**
 * Application shell.
 *
 * Phase 6 replaces this with the router, QueryClientProvider, and AuthProvider, at which point
 * route-level screens live in `pages/` and this file only composes providers.
 */
export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-forge-600 text-sm font-semibold tracking-widest uppercase">Forge</p>
      <h1 className="text-3xl font-bold">Habits, budgets, and challenges — with points.</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Project scaffold is in place. Authentication and the role-aware dashboards arrive in later
        phases.
      </p>
    </main>
  );
}
