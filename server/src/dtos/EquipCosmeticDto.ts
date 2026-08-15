import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Which redemption to wear, or `null` to wear nothing.
 *
 * `ValidateIf` rather than `@IsOptional`: the two mean different things here. Optional would let the
 * field be omitted entirely, which is ambiguous — did the caller mean "take it off" or "leave it
 * alone"? Requiring the field and permitting an explicit `null` makes unequipping something the caller
 * has to say, rather than something a dropped field does by accident.
 */
export class EquipCosmeticDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID('4', { message: 'redemptionId must be a UUID, or null to unequip' })
  redemptionId!: string | null;
}
