import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RewardItemType } from '../entities/RewardItem';
import { ListQueryDto, toQueryBoolean } from './ListQueryDto';

/** The CSS custom properties a cosmetic overrides when equipped. */
export class CosmeticThemeDto {
  @IsHexColor()
  primary!: string;

  @IsHexColor()
  accent!: string;

  @IsHexColor()
  surface!: string;
}

export class CreateRewardItemDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(10, 2000)
  description!: string;

  @IsEnum(RewardItemType)
  type!: RewardItemType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pointsCost!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;

  /**
   * Required in practice for a `COSMETIC` and meaningless for a `VOUCHER`, which the service enforces —
   * a cross-field rule the validator cannot express, and one that keeps an unwearable cosmetic out of the
   * store.
   *
   * Validated as a nested object so the colours inside it are checked too; without `ValidateNested` this
   * would accept any shape at all and store it as jsonb.
   */
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CosmeticThemeDto)
  cosmeticTheme?: CosmeticThemeDto;
}

export class UpdateRewardItemDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(10, 2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pointsCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  /** Items are deactivated rather than deleted, so past redemptions keep pointing at something real. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CosmeticThemeDto)
  cosmeticTheme?: CosmeticThemeDto;
}

/**
 * `type` is absent: it decides whether an item is wearable or consumable, and changing it after people have
 * redeemed the item would retroactively change what they bought.
 */

export const REWARD_SORT_FIELDS = ['pointsCost', 'name', 'stock', 'createdAt'] as const;
export type RewardSortField = (typeof REWARD_SORT_FIELDS)[number];

export class RewardItemQueryDto extends ListQueryDto {
  /** The store's "category" filter, per the graded search contract. */
  @IsOptional()
  @IsEnum(RewardItemType)
  type?: RewardItemType;

  @IsOptional()
  @IsIn(REWARD_SORT_FIELDS, { message: `sortBy must be one of: ${REWARD_SORT_FIELDS.join(', ')}` })
  sortBy?: RewardSortField;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPointsCost?: number;

  /** Admin-only: the store listing never shows deactivated items regardless of this. */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  includeInactive?: boolean;
}
