import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler, tokenStorage } from '../services/api';
import { authApi } from '../services/auth';
import type { LoginRequest, RegisterRequest } from '../services/auth';
import { queryKeys } from '../services/queryKeys';
import type { PublicUser } from '../types/api';
import { AuthContext } from './auth-context';
import type { AuthContextValue, AuthStatus } from './auth-context';

/**
 * Owns the session: who is signed in, and how that survives a page refresh.
 *
 * The stored token is treated as a claim, not as an answer. On mount, if one exists, the account behind
 * it is re-read from the server — that is what makes a suspended account, a deleted account, or a
 * changed role take effect on the next page load rather than whenever the token happens to expire. The
 * role the UI branches on comes from that response, never from decoding the token.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStorage.read());

  const profile = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authApi.me,
    // No token means nobody to look up. The query stays idle rather than firing a request that is
    // certain to 401.
    enabled: token !== null,
    // A rejected token will be rejected again. Retrying only delays the login screen.
    retry: false,
    staleTime: Infinity,
  });

  /**
   * Forgets the session locally.
   *
   * `queryClient.clear()` is the important half: every cached list was fetched as somebody, and leaving
   * it behind would show the previous user's data for a frame after the next sign-in.
   */
  const forgetSession = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  // The axios interceptor cannot reach React state, so it calls back here when the API rejects a token.
  useEffect(() => {
    setUnauthorizedHandler(forgetSession);
    return () => setUnauthorizedHandler(null);
  }, [forgetSession]);

  const adopt = useCallback(
    (result: { token: string; user: PublicUser }) => {
      tokenStorage.write(result.token);
      setToken(result.token);
      // The sign-in response already contains the profile, so seeding the cache with it saves an
      // immediate second round trip for data we are holding.
      queryClient.setQueryData(queryKeys.auth.me, result.user);
      return result.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (request: LoginRequest) => adopt(await authApi.login(request)),
    [adopt],
  );

  const register = useCallback(
    async (request: RegisterRequest) => adopt(await authApi.register(request)),
    [adopt],
  );

  const status: AuthStatus =
    token === null
      ? 'anonymous'
      : profile.isSuccess
        ? 'authenticated'
        : profile.isError
          ? 'anonymous'
          : 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'authenticated' ? (profile.data ?? null) : null,
      login,
      register,
      logout: forgetSession,
    }),
    [status, profile.data, login, register, forgetSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
