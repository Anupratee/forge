import type { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { Role } from '../entities/User';
import { User, UserStatus } from '../entities/User';
import { ConflictError, UnauthorizedError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';
import { signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';

/**
 * The roles an account may be created with.
 *
 * Admin is absent on purpose, and expressed as a type rather than a runtime check: nobody can sign
 * themselves up as an administrator, and the compiler refuses the call rather than a validator having
 * to remember to. Admin accounts come from the seed, or from an existing Admin changing a role.
 */
export type RegisterableRole = Role.USER | Role.CREATOR;

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  role: RegisterableRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * A user as the API is willing to describe them. Built by picking fields explicitly rather than by
 * deleting `passwordHash` from an entity — a new sensitive column would be exposed by default under
 * the second approach and stays hidden under this one.
 */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarImage: string | null;
  role: Role;
  status: UserStatus;
  leaderboardOptIn: boolean;
  createdAt: Date;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

/** What `authenticate` needs on every request, and nothing more. */
export interface AuthenticatedAccount {
  id: string;
  role: Role;
}

/**
 * A valid bcrypt hash of a random string nobody knows.
 *
 * Login compares against this when the email matches no account, so a request for an unknown address
 * costs the same time as one for a known address with the wrong password. Without it, the difference
 * between "no bcrypt work" and "one bcrypt comparison at cost 12" is measurable from outside and turns
 * the login endpoint into a way to enumerate registered emails.
 */
const DECOY_HASH = '$2b$12$1o5Upv0mFgkWOIwHLryTKelpek9dqBhoNILFWKNMnpvxUP64aqs.2';

/**
 * Registration, login, and identity lookup.
 *
 * Takes its `DataSource` rather than reaching for a global one, so a test can hand it a different
 * database. Repositories are resolved per call because metadata only exists once the source is
 * initialised, which happens after this module is imported.
 */
export class AuthService {
  constructor(private readonly dataSource: DataSource) {}

  private get users(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);

    const user = this.users.create({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      role: input.role,
    });

    let saved: User;
    try {
      saved = await this.users.save(user);
    } catch (error) {
      // The unique index is the guard, not a preceding "is this email taken?" read — that read is a
      // race two simultaneous registrations would both pass.
      if (isUniqueViolation(error, 'uq_users_email')) {
        throw new ConflictError('An account with that email address already exists');
      }
      throw error;
    }

    // Read back rather than describing the in-memory entity. `status` and `leaderboardOptIn` are
    // filled in by column defaults, so this is the only way to be sure the registration response says
    // the same thing a following `GET /auth/me` will.
    return this.issue(await this.getProfile(saved.id));
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);

    // `passwordHash` carries `select: false`, so it has to be asked for explicitly. That is the point:
    // every other read of a user omits it by default.
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? DECOY_HASH);

    // One message for "no such account" and for "wrong password". Telling them apart would let anyone
    // test whether an address is registered.
    if (!user || !passwordMatches) {
      throw new UnauthorizedError('Email or password is incorrect');
    }

    // Checked after the password, so a suspended account cannot be identified without its credentials.
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('This account is suspended. Contact an administrator.');
    }

    await this.users.update(user.id, { lastLoginAt: new Date() });

    return this.issue(toPublicUser(user));
  }

  /**
   * Resolves a token's subject to a live account, for `authenticate` to run on every request.
   *
   * Role and status come from the database rather than from the token. A token is a bearer credential
   * valid until it expires, so trusting its claims would leave a suspended account working and a
   * demoted Admin still administering until their token ran out.
   *
   * Only three columns are selected — this runs on every authenticated request, and none of the rest
   * are needed to decide whether the caller may proceed.
   */
  async getAuthenticatedAccount(userId: string): Promise<AuthenticatedAccount> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    // Same message as an invalid token: from the caller's side, a token naming a deleted account and a
    // forged one are the same failure.
    if (!user) {
      throw new UnauthorizedError('Access token is missing, invalid, or expired');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('This account is suspended. Contact an administrator.');
    }

    return { id: user.id, role: user.role };
  }

  /** The caller's own profile, for `GET /auth/me`. */
  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.users.findOneBy({ id: userId });

    if (!user) {
      throw new UnauthorizedError('Access token is missing, invalid, or expired');
    }

    return toPublicUser(user);
  }

  private issue(user: PublicUser): AuthResult {
    return {
      token: signAccessToken({ sub: user.id, role: user.role }),
      user,
    };
  }
}

/**
 * Email is stored lower-cased and trimmed, so the unique index is effectively case-insensitive and
 * `Asha@Forge.test` cannot become a second account alongside `asha@forge.test`.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatarImage: user.avatarImage,
    role: user.role,
    status: user.status,
    leaderboardOptIn: user.leaderboardOptIn,
    createdAt: user.createdAt,
  };
}

/** The instance the middleware, controllers, and routes share. */
export const authService = new AuthService(AppDataSource);
