import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ChallengeCategory } from '../entities/Challenge';
import { ISO_DATE_PATTERN } from '../utils/date';

/**
 * Creating a challenge. Always starts as a DRAFT, so there is no `status` field — the status is the state
 * machine's to set, and accepting one here would be a way to publish without approval.
 *
 * `coverImage` is absent for the same kind of reason: it is a file, handled by the upload middleware, and a
 * client-supplied path would be a way to point a challenge at an arbitrary file on disk.
 *
 * Numbers carry `@Type` because this endpoint accepts `multipart/form-data` when a cover image is attached,
 * and every field of a multipart body arrives as a string.
 */
export class CreateChallengeDto {
  @IsString()
  @Length(3, 140)
  title!: string;

  @IsString()
  @Length(20, 5000, { message: 'description must be between 20 and 5000 characters' })
  description!: string;

  @IsEnum(ChallengeCategory)
  category!: ChallengeCategory;

  /**
   * The window, as calendar dates. That `endDate` must be after `startDate` is a *business* invariant, so
   * `ChallengeService` checks it — class-validator cannot compare two fields without a custom decorator,
   * and the database's own check constraint would surface as a 500 rather than a helpful 400.
   */
  @Matches(ISO_DATE_PATTERN, { message: 'startDate must be a date in YYYY-MM-DD form' })
  startDate!: string;

  @Matches(ISO_DATE_PATTERN, { message: 'endDate must be a date in YYYY-MM-DD form' })
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  pointsReward!: number;
}
