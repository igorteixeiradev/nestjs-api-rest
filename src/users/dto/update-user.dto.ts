import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto.js';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;
}
