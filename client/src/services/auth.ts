import type { Role } from '../types/enums';
import type { AuthResult, PublicUser } from '../types/api';
import { api } from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  /**
   * Only the two self-service roles. An Admin account is created by the seed, never by registration —
   * the server's DTO rejects `ADMIN` outright, and repeating the restriction in this type means the
   * form cannot even offer it.
   */
  role: typeof Role.USER | typeof Role.CREATOR;
}

/**
 * What a user may change about themselves.
 *
 * Role, status, and email are absent because the server's DTO rejects them outright — this type
 * mirrors that restriction rather than enforcing it.
 */
export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  leaderboardOptIn?: boolean;
}

export const authApi = {
  async login(request: LoginRequest): Promise<AuthResult> {
    const { data } = await api.post<AuthResult>('/auth/login', request);
    return data;
  },

  async register(request: RegisterRequest): Promise<AuthResult> {
    const { data } = await api.post<AuthResult>('/auth/register', request);
    return data;
  },

  /**
   * The current account, re-read from the server.
   *
   * This is what makes a stored token trustworthy on a page load: the token says who someone claims to
   * be, and this says whether that account still exists, is still active, and still holds the role the
   * token was issued with.
   */
  async me(): Promise<PublicUser> {
    const { data } = await api.get<PublicUser>('/auth/me');
    return data;
  },

  /** Updates the caller's own profile. The subject is the token's, so there is no id to get wrong. */
  async updateMe(request: UpdateProfileRequest): Promise<PublicUser> {
    const { data } = await api.patch<PublicUser>('/auth/me', request);
    return data;
  },
};
