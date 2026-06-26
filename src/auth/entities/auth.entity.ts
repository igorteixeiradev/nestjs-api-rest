import { UserEntity } from '../../users/entities/user.entity.js';

export class AuthJwt {
  accessToken: string;
  user: UserEntity;

  constructor(partial: Partial<AuthJwt>) {
    Object.assign(this, partial);
  }
}
