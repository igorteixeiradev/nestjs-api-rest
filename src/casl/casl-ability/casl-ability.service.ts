import { Ability, AbilityBuilder } from '@casl/ability';
import {
  accessibleBy,
  createPrismaAbility,
  PrismaQuery,
  Subjects,
} from '@casl/prisma';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  Post,
  Prisma,
  Role,
  User,
} from '../../generated/prisma/client.js';

export type PermAction = 'read' | 'create' | 'update' | 'delete' | 'manage';

export type PermissionsResource = Subjects<{ User: User; Post: Post }> | 'all';

export type AppAbility = Ability<
  [PermAction, PermissionsResource],
  PrismaQuery
>;

/** Only the fields needed to compute permissions. */
export type AbilityActor = Pick<User, 'id' | 'role'>;

type DefinePermissions = (
  user: AbilityActor,
  builder: AbilityBuilder<AppAbility>,
) => void;

/** Fields a non-admin user may change on their own account. `role` is NOT one of them. */
const SELF_UPDATABLE_USER_FIELDS = ['name', 'email', 'password'];

const rolePermissionsMap: Record<Role, DefinePermissions> = {
  ADMIN(user, { can }) {
    can('manage', 'all');
  },
  EDITOR(user, { can }) {
    can('create', 'Post');
    can('read', 'Post');
    can('update', 'Post');
  },
  WRITER(user, { can }) {
    can('create', 'Post');
    can('read', 'Post', { published: true });
    can('read', 'Post', { authorId: user.id });
    can('update', 'Post', { authorId: user.id });
    can('delete', 'Post', { authorId: user.id });
  },
  READER(user, { can }) {
    can('read', 'Post', { published: true });
  },
};

@Injectable()
export class CaslAbilityService {
  createForUser(user: AbilityActor): AppAbility {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    const { can } = builder;

    // Every authenticated user can see and edit their own account (never their role).
    can('read', 'User', { id: user.id });
    can('update', 'User', SELF_UPDATABLE_USER_FIELDS, { id: user.id });

    rolePermissionsMap[user.role](user, builder);
    return builder.build();
  }

  /**
   * Prisma `where` that matches only the users `actor` is allowed to read.
   * (Typed here because @casl/prisma cannot infer the types of the client
   * generated into src/generated.)
   */
  readableUsersWhere(actor: AbilityActor): Prisma.UserWhereInput {
    return accessibleBy(this.createForUser(actor), 'read').ofType(
      'User',
    ) as Prisma.UserWhereInput;
  }

  /** Prisma `where` that matches only the posts `actor` is allowed to read. */
  readablePostsWhere(actor: AbilityActor): Prisma.PostWhereInput {
    return accessibleBy(this.createForUser(actor), 'read').ofType(
      'Post',
    ) as Prisma.PostWhereInput;
  }

  /**
   * Throws 403 when `user` is not allowed to do `action` on `subject`
   * (optionally restricted to a single `field`).
   */
  authorize(
    user: AbilityActor,
    action: PermAction,
    subject: PermissionsResource,
    field?: string,
  ): void {
    if (!this.createForUser(user).can(action, subject, field)) {
      throw new ForbiddenException(
        'You are not allowed to perform this action',
      );
    }
  }
}
