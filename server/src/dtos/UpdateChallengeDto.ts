import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ChallengeCategory } from '../entities/Challenge';
import { ISO_DATE_PATTERN } from '../utils/date';

/**
 * Editing a challenge. Every field is optional — a caller sends only what changes.
 *
 * Spelled out rather than derived from `CreateChallengeDto` by some partial-type helper: class-validator has
 * no such helper without pulling in a framework, and being explicit means the two DTOs can legitimately
 * diverge (an edit accepts no new `status`, and could accept fields creation does not).
 *
 * Which of these count as *material* — and therefore send an approved challenge back for re-approval — is
 * decided by `MATERIAL_FIELDS` in the state machine, not here. The DTO's job is shape.
 */
export class UpdateChallengeDto {
  @IsOptional()
  @IsString()
  @Length(3, 140)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(20, 5000, { message: 'description must be between 20 and 5000 characters' })
  description?: string;

  @IsOptional()
  @IsEnum(ChallengeCategory)
  category?: ChallengeCategory;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'startDate must be a date in YYYY-MM-DD form' })
  startDate?: string;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'endDate must be a date in YYYY-MM-DD form' })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  pointsReward?: number;
}
