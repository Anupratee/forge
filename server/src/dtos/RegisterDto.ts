import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Role } from '../entities/User';

/**
 * Registration request body.
 *
 * `Role.ADMIN` is not accepted here, and `AuthService.register` narrows its parameter to the two roles
 * below as well — so self-promotion is refused by the validator *and* impossible to express in a call
 * to the service. Those are the same rule stated once at the boundary and once in the type system,
 * not the same check run twice at runtime.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  /**
   * The lower bound is a security floor. The upper bound is a bcrypt fact: bcrypt hashes at most 72
   * bytes and silently ignores the rest, so accepting a 200-character passphrase would quietly honour
   * only its first 72 and mislead anyone who chose a long one deliberately.
   */
  @IsString()
  @MinLength(10, { message: 'password must be at least 10 characters' })
  @MaxLength(72, { message: 'password must be at most 72 characters' })
  password!: string;

  @IsString()
  @Length(2, 80)
  displayName!: string;

  /**
   * Optional, defaulting to a plain user. A Creator says so at sign-up; nobody self-registers as an
   * Admin.
   */
  @IsOptional()
  @IsIn([Role.USER, Role.CREATOR], { message: 'role must be USER or CREATOR' })
  role?: Role.USER | Role.CREATOR;
}
