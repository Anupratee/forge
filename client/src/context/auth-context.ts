import { createContext } from 'react';
import type { PublicUser } from '../types/api';
import type { LoginRequest, RegisterRequest } from '../services/auth';

/**
 * Three states, not a boolean.
 *
 * `loading` is the gap between a page load that found a stored token and the server confirming the
 * account behind it. Collapsing that into "not authenticated" would bounce every refresh to the login
 * screen for a moment, and collapsing it into "authenticated" would render a dashboard for an account
 * that may since have been suspended.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  /** Non-null exactly when `status` is `authenticated`. */
  user: PublicUser | null;
  login: (request: LoginRequest) => Promise<PublicUser>;
  register: (request: RegisterRequest) => Promise<PublicUser>;
  logout: () => void;
}

/**
 * Undefined until a provider supplies a value, which is what lets `useAuth` tell "no provider above me"
 * apart from "nobody is signed in". A default object here would turn a wiring mistake into a silent
 * logged-out state that looks legitimate.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
