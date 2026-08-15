import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * What a user may change about their own account.
 *
 * Notably absent: `role`, `status`, and `email`. Role and status are governed by an Admin, and letting
 * this endpoint touch either would hand every user the ability to promote or reinstate themselves —
 * `whitelist` + `forbidNonWhitelisted` means sending one is a 400 rather than a silently ignored field.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  /** Opting out removes the account from the ranking query entirely, not just from the response. */
  @IsOptional()
  @IsBoolean()
  leaderboardOptIn?: boolean;
}
