import { IsString, Length } from 'class-validator';

/**
 * Rejecting a submitted challenge.
 *
 * The reason is required, and required to be substantial. The specification makes rejection a reviewed
 * decision the Creator can act on, and a one-word "no" is not something anyone can revise a challenge
 * against — the lower bound is what makes the field useful rather than ceremonial.
 */
export class RejectChallengeDto {
  @IsString()
  @Length(10, 2000, { message: 'reason must explain the rejection in at least 10 characters' })
  reason!: string;
}
