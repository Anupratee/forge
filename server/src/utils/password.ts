import bcrypt from 'bcrypt';

/**
 * Password hashing, in one place.
 *
 * Cost 12 is the course requirement. It lives here as a single constant so the seed script and
 * `AuthService` cannot drift apart — two call sites hashing at different costs would produce a
 * database where some passwords are cheaper to attack than others, and nothing would report it.
 */
const BCRYPT_COST = 12;

/** Hashes a plaintext password. The plaintext is never logged, returned, or stored. */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Compares a candidate password against a stored hash.
 *
 * `bcrypt.compare` is constant-time with respect to the hash, so it does not leak how much of the
 * password matched.
 */
export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
