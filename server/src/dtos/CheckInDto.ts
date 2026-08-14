import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ISO_DATE_PATTERN } from '../utils/date';

/**
 * Recording a daily check-in.
 *
 * The date is optional and defaults to today. It may be set to an earlier day so a participant can log one
 * they missed — the service confines it to the challenge's own window and refuses anything in the future,
 * and the unique key on `(participation_id, check_in_date)` means a backfilled day still cannot be paid for
 * twice.
 *
 * A proof image, when supplied, arrives as a file rather than through this body.
 */
export class CheckInDto {
  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be a date in YYYY-MM-DD form' })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
