import { ForbiddenException } from '@nestjs/common';
import { subject } from '@casl/ability';
import { CaslAbilityService } from './casl-ability.service.js';
import type { AbilityActor } from './casl-ability.service.js';
import type { Post, Role, User } from '../../generated/prisma/client.js';

describe('CaslAbilityService', () => {
  const service = new CaslAbilityService();

  const actor = (role: Role, id = 'me'): AbilityActor => ({ id, role });
  const can = (
    who: AbilityActor,
    action: Parameters<CaslAbilityService['authorize']>[1],
    target: Parameters<CaslAbilityService['authorize']>[2],
    field?: string,
  ) => service.createForUser(who).can(action, target, field);

  const post = (authorId: string, published: boolean) =>
    subject('Post', {
      id: 'post-1',
      title: 't',
      content: 'c',
      published,
      authorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Post);

  const user = (id: string) =>
    subject('User', {
      id,
      name: 'n',
      email: 'e@e.com',
      password: 'hash',
      role: 'READER',
      permissions: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies User);

  describe('Posts', () => {
    it('ADMIN can do everything', () => {
      const admin = actor('ADMIN');
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(can(admin, action, post('other', false))).toBe(true);
      }
    });

    it('EDITOR can create, read and update any post, but not delete', () => {
      const editor = actor('EDITOR');
      expect(can(editor, 'create', 'Post')).toBe(true);
      expect(can(editor, 'read', post('other', false))).toBe(true);
      expect(can(editor, 'update', post('other', false))).toBe(true);
      expect(can(editor, 'delete', post('other', true))).toBe(false);
    });

    it('WRITER manages only their own posts', () => {
      const writer = actor('WRITER', 'w1');
      expect(can(writer, 'create', 'Post')).toBe(true);

      expect(can(writer, 'update', post('w1', false))).toBe(true);
      expect(can(writer, 'delete', post('w1', false))).toBe(true);
      expect(can(writer, 'update', post('w2', true))).toBe(false);
      expect(can(writer, 'delete', post('w2', true))).toBe(false);
    });

    it('WRITER reads published posts and their own drafts, not other drafts', () => {
      const writer = actor('WRITER', 'w1');
      expect(can(writer, 'read', post('w2', true))).toBe(true);
      expect(can(writer, 'read', post('w1', false))).toBe(true);
      expect(can(writer, 'read', post('w2', false))).toBe(false);
    });

    it('READER can only read published posts', () => {
      const reader = actor('READER');
      expect(can(reader, 'read', post('w1', true))).toBe(true);
      expect(can(reader, 'read', post('w1', false))).toBe(false);
      expect(can(reader, 'create', 'Post')).toBe(false);
      expect(can(reader, 'update', post('w1', true))).toBe(false);
      expect(can(reader, 'delete', post('w1', true))).toBe(false);
    });
  });

  describe('Users', () => {
    it.each(['EDITOR', 'WRITER', 'READER'] as const)(
      '%s can read and edit name/email/password of their own account only',
      (role) => {
        const me = actor(role, 'me');
        expect(can(me, 'read', user('me'))).toBe(true);
        expect(can(me, 'read', user('someone-else'))).toBe(false);

        for (const field of ['name', 'email', 'password']) {
          expect(can(me, 'update', user('me'), field)).toBe(true);
          expect(can(me, 'update', user('someone-else'), field)).toBe(false);
        }
      },
    );

    it.each(['EDITOR', 'WRITER', 'READER'] as const)(
      '%s can never change their own role, create or delete users',
      (role) => {
        const me = actor(role, 'me');
        expect(can(me, 'update', user('me'), 'role')).toBe(false);
        expect(can(me, 'create', 'User')).toBe(false);
        expect(can(me, 'delete', user('me'))).toBe(false);
      },
    );

    it('ADMIN can manage any user, including the role', () => {
      const admin = actor('ADMIN');
      expect(can(admin, 'update', user('other'), 'role')).toBe(true);
      expect(can(admin, 'create', 'User')).toBe(true);
      expect(can(admin, 'delete', user('other'))).toBe(true);
    });
  });

  describe('authorize()', () => {
    it('does nothing when allowed', () => {
      expect(() =>
        service.authorize(actor('ADMIN'), 'delete', user('x')),
      ).not.toThrow();
    });

    it('throws ForbiddenException when not allowed', () => {
      expect(() =>
        service.authorize(actor('READER'), 'delete', user('x')),
      ).toThrow(ForbiddenException);
    });
  });

  describe('where helpers', () => {
    it('readablePostsWhere restricts a READER to published posts', () => {
      expect(
        JSON.stringify(service.readablePostsWhere(actor('READER'))),
      ).toContain('"published":true');
    });

    it('readableUsersWhere restricts non-admins to their own id', () => {
      expect(
        JSON.stringify(service.readableUsersWhere(actor('WRITER', 'w1'))),
      ).toContain('"id":"w1"');
    });
  });
});
