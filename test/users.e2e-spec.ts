import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  createUser,
  PASSWORD,
  resetDatabase,
  TestUser,
  UNKNOWN_ID,
} from './helpers.js';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let writer: TestUser;
  let reader: TestUser;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await createUser(app, prisma, 'admin', 'ADMIN');
    writer = await createUser(app, prisma, 'writer', 'WRITER');
    reader = await createUser(app, prisma, 'reader', 'READER');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users', () => {
    it('ADMIN lists everyone, never exposing the password hash', async () => {
      const res = await http()
        .get('/users')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(res.body).toHaveLength(3);
      for (const user of res.body) {
        expect(user).not.toHaveProperty('password');
      }
    });

    it('non-admins only see themselves', async () => {
      const res = await http()
        .get('/users')
        .set('Authorization', bearer(reader))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(reader.id);
    });
  });

  describe('GET /users/:id', () => {
    it('a user can read themselves', async () => {
      const res = await http()
        .get(`/users/${reader.id}`)
        .set('Authorization', bearer(reader))
        .expect(200);

      expect(res.body.id).toBe(reader.id);
      expect(res.body).not.toHaveProperty('password');
    });

    it('a user cannot read someone else', async () => {
      await http()
        .get(`/users/${admin.id}`)
        .set('Authorization', bearer(reader))
        .expect(403);
    });

    it('ADMIN can read anyone', async () => {
      await http()
        .get(`/users/${reader.id}`)
        .set('Authorization', bearer(admin))
        .expect(200);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .get(`/users/${UNKNOWN_ID}`)
        .set('Authorization', bearer(admin))
        .expect(404);
    });
  });

  describe('POST /users', () => {
    const payload = { name: 'New', email: 'new@test.com', password: PASSWORD };

    it('ADMIN can create a user', async () => {
      const res = await http()
        .post('/users')
        .set('Authorization', bearer(admin))
        .send(payload)
        .expect(201);

      expect(res.body.email).toBe(payload.email);
      expect(res.body).not.toHaveProperty('password');
    });

    it.each(['writer', 'reader'] as const)(
      '%s cannot create a user',
      async (who) => {
        const actor = who === 'writer' ? writer : reader;
        await http()
          .post('/users')
          .set('Authorization', bearer(actor))
          .send(payload)
          .expect(403);

        expect(
          await prisma.user.count({ where: { email: payload.email } }),
        ).toBe(0);
      },
    );
  });

  describe('PATCH /users/:id', () => {
    it('a user can rename themselves without sending a role', async () => {
      const res = await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(reader))
        .send({ name: 'Renamed' })
        .expect(200);

      expect(res.body.name).toBe('Renamed');
    });

    it.each(['writer', 'reader'] as const)(
      '%s cannot promote themselves to ADMIN',
      async (who) => {
        const actor = who === 'writer' ? writer : reader;
        await http()
          .patch(`/users/${actor.id}`)
          .set('Authorization', bearer(actor))
          .send({ role: 'ADMIN' })
          .expect(403);

        const stored = await prisma.user.findUniqueOrThrow({
          where: { id: actor.id },
        });
        expect(stored.role).toBe(actor.role);
      },
    );

    it('a user cannot edit someone else', async () => {
      await http()
        .patch(`/users/${admin.id}`)
        .set('Authorization', bearer(reader))
        .send({ name: 'hacked' })
        .expect(403);
    });

    it('ADMIN can change the role of any user', async () => {
      const res = await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(admin))
        .send({ role: 'EDITOR' })
        .expect(200);

      expect(res.body.role).toBe('EDITOR');
    });

    it('rejects an invalid role and unknown fields', async () => {
      await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(admin))
        .send({ role: 'SUPERUSER' })
        .expect(400);
      await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(admin))
        .send({ id: UNKNOWN_ID })
        .expect(400);
    });

    it('answers 400 (not 500) when the new email is already taken', async () => {
      await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(reader))
        .send({ email: admin.email })
        .expect(400);
    });

    it('allows keeping the same email', async () => {
      await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(reader))
        .send({ email: reader.email, name: 'Same email' })
        .expect(200);
    });

    it('hashes the new password, so login keeps working', async () => {
      await http()
        .patch(`/users/${reader.id}`)
        .set('Authorization', bearer(reader))
        .send({ password: 'brand-new-pass' })
        .expect(200);

      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: reader.id },
      });
      expect(stored.password).not.toBe('brand-new-pass');
      expect(await bcrypt.compare('brand-new-pass', stored.password)).toBe(
        true,
      );

      await http()
        .post('/auth/login')
        .send({ email: reader.email, password: 'brand-new-pass' })
        .expect(201);
      await http()
        .post('/auth/login')
        .send({ email: reader.email, password: PASSWORD })
        .expect(401);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .patch(`/users/${UNKNOWN_ID}`)
        .set('Authorization', bearer(admin))
        .send({ name: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it.each(['writer', 'reader'] as const)(
      '%s cannot delete users',
      async (who) => {
        const actor = who === 'writer' ? writer : reader;
        await http()
          .delete(`/users/${admin.id}`)
          .set('Authorization', bearer(actor))
          .expect(403);
        await http()
          .delete(`/users/${actor.id}`)
          .set('Authorization', bearer(actor))
          .expect(403);

        expect(await prisma.user.count()).toBe(3);
      },
    );

    it('ADMIN deletes a user together with their posts (no 500)', async () => {
      await prisma.post.createMany({
        data: [
          { title: 'a', content: 'c', authorId: writer.id },
          { title: 'b', content: 'c', authorId: writer.id },
        ],
      });

      await http()
        .delete(`/users/${writer.id}`)
        .set('Authorization', bearer(admin))
        .expect(204);

      expect(
        await prisma.user.findUnique({ where: { id: writer.id } }),
      ).toBeNull();
      expect(await prisma.post.count()).toBe(0);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .delete(`/users/${UNKNOWN_ID}`)
        .set('Authorization', bearer(admin))
        .expect(404);
    });
  });
});
