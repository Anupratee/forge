import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { Role, UserStatus } from '../entities/User';
import { ListQueryDto } from './ListQueryDto';

export const USER_SORT_FIELDS = [
  'displayName',
  'email',
  'role',
  'createdAt',
  'lastLoginAt',
] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export class AdminUserQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsIn(USER_SORT_FIELDS, { message: `sortBy must be one of: ${USER_SORT_FIELDS.join(', ')}` })
  sortBy?: UserSortField;
}

/**
 * Suspension and reactivation are the same operation with a different target state, so they share one
 * endpoint rather than becoming `/suspend` and `/reactivate` — two routes that would have to stay in
 * step and could disagree about what happens when an account is already in the state asked for.
 */
export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}
