import { Exclude } from 'class-transformer';
import { Role } from '../../generated/prisma/enums.js';

export class UserEntity {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  password: string;
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
