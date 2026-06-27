import { Ability, AbilityBuilder } from '@casl/ability';
import { Injectable, Scope } from '@nestjs/common';
import type { User, Post, Role } from '../../generated/prisma/client.js';
import { createPrismaAbility, Subjects } from '@casl/prisma';

export type PermAction = 'read' | 'create' | 'update' | 'delete' | 'manage';

export type PermissionsResourse = Subjects<{ User: User; Post: Post }> | 'all';

export type AppAbility = Ability<[PermAction, PermissionsResourse]>;
export type DefinePermissions = (
  user: User,
  builder: AbilityBuilder<AppAbility>,
) => void;

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
    can('read', 'Post', { authorId: user.id });
    can('update', 'Post', { authorId: user.id });
  },
  READER(user, { can }) {
    can('read', 'Post', { published: true });
  },
};

@Injectable({ scope: Scope.REQUEST })
export class CaslAbilityService {
  ability: AppAbility;

  defineAbilityFor(user: User) {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    rolePermissionsMap[user.role](user, builder);
    this.ability = builder.build();
    return this.ability;
  }
}
