import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Where to go after signing in.
   *
   * `RequireRole` puts the attempted path here when it redirects, so following a link while signed out
   * lands on that page afterwards rather than on the dashboard.
   */
  const destination = (location.state as { from?: string } | null)?.from ?? '/';

  const signIn = useMutation({
    mutationFn: () => login({ email, password }),
    onSuccess: () => navigate(destination, { replace: true }),
  });

  if (status === 'loading') return <Loading label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to={destination} replace />;

  const error = signIn.error instanceof ApiError ? signIn.error : null;

  return (
    <AuthShell title="Sign in to Forge" subtitle="Habits, budgets, and challenges — with points.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signIn.mutate();
        }}
      >
        <TextField
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          required
          error={error?.messageFor('email')}
          onChange={(event) => setEmail(event.target.value)}
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          error={error?.messageFor('password')}
          onChange={(event) => setPassword(event.target.value)}
        />

        {/*
          Field-level messages are shown beside their input, so the banner is for everything else —
          wrong credentials, a suspended account, an unreachable API.
        */}
        {signIn.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={signIn.error} />
        )}

        <Button type="submit" busy={signIn.isPending} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        No account?{' '}
        <Link to="/register" className="text-forge-600 font-medium hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

/** Shared frame for the two signed-out screens, so they are visually one thing. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <p className="text-forge-600 text-sm font-semibold tracking-widest uppercase">Forge</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <Card>
        <CardBody>{children}</CardBody>
      </Card>
    </main>
  );
}
