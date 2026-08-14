import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Login request body.
 *
 * The length bounds here are looser than `RegisterDto`'s on purpose. They exist only to reject
 * obviously malformed input cheaply; rejecting a short password with a *validation* message would tell
 * the caller their guess was too short to be anyone's real password, which is a hint they should not
 * get. A wrong password of any acceptable length gets the same 401 as an unknown email.
 */
export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
