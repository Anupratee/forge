import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { Role } from '../types/enums';
import { AuthShell } from './LoginPage';

/**
 * The two roles anyone may sign up as.
 *
 * `ADMIN` is absent because the server's `RegisterDto` rejects it — an Admin account comes from the
 * seed. This list mirrors that restriction rather than enforcing it; the API is what enforces it.
 */
const SELF_SERVICE_ROLES = [Role.USER, Role.CREATOR] as const;

const ROLE_DESCRIPTIONS: Record<(typeof SELF_SERVICE_ROLES)[number], string> = {
  [Role.USER]: 'Track habits and budgets, join challenges, and redeem points.',
  [Role.CREATOR]: 'Author challenges for Admin approval and follow your participants.',
};

export function RegisterPage() {
  const { status, register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<(typeof SELF_SERVICE_ROLES)[number]>(Role.USER);

  const signUp = useMutation({
    mutationFn: () => register({ email, password, displayName, role }),
    onSuccess: () => navigate('/', { replace: true }),
  });

  if (status === 'loading') return <Loading label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const error = signUp.error instanceof ApiError ? signUp.error : null;

  return (
    <AuthShell
      title="Create an account"
      subtitle="One role per account — choose how you will use Forge."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signUp.mutate();
        }}
      >
        <TextField
          label="Display name"
          value={displayName}
          autoComplete="name"
          required
          error={error?.messageFor('displayName')}
          onChange={(event) => setDisplayName(event.target.value)}
        />

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
          autoComplete="new-password"
          required
          hint="At least 10 characters."
          error={error?.messageFor('password')}
          onChange={(event) => setPassword(event.target.value)}
        />

        <SelectField
          label="Role"
          value={role}
          options={SELF_SERVICE_ROLES}
          hint={ROLE_DESCRIPTIONS[role]}
          error={error?.messageFor('role')}
          onChange={(event) => setRole(event.target.value as (typeof SELF_SERVICE_ROLES)[number])}
        />

        {signUp.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={signUp.error} />
        )}

        <Button type="submit" busy={signUp.isPending} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="text-forge-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
