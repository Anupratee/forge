import { useContext } from 'react';
import { AuthContext } from '../context/auth-context';
import type { AuthContextValue } from '../context/auth-context';
import { Role } from '../types/enums';

/**
 * The session, and the only place outside `RequireRole` that answers a role question.
 *
 * Components ask `isAdmin` rather than comparing `user.role` themselves, so the set of places that
 * know how roles are spelled stays at two. These are for showing and hiding UI — the API enforces the
 * same rules independently, and a hidden button is not a permission.
 */
export function useAuth(): AuthContextValue & {
  isAdmin: boolean;
  isCreator: boolean;
  isUser: boolean;
} {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }

  return {
    ...context,
    isAdmin: context.user?.role === Role.ADMIN,
    isCreator: context.user?.role === Role.CREATOR,
    isUser: context.user?.role === Role.USER,
  };
}
