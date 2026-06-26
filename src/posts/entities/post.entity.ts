import { Exclude } from 'class-transformer';
import { UserEntity } from '../../users/entities/user.entity.js';

export class PostEntity {
  id: string;
  title: string;
  content: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: UserEntity;
  @Exclude()
  authorId: string;
  constructor(partial: Partial<PostEntity>) {
    Object.assign(this, partial);
  }
}
