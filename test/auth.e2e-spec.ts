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
} from './helpers.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/sign-up', () => {
    const body = { name: 'Igor', email: 'igor@test.com', password: PASSWORD };

    it('creates a READER and never returns the password', async () => {
      const res = await http().post('/auth/sign-up').send(body).expect(201);

      expect(res.body).toMatchObject({
        name: 'Igor',
        email: 'igor@test.com',
        role: 'READER',
      });
      expect(res.body).not.toHaveProperty('password');
    });

    it('stores the password as a bcrypt hash', async () => {
      await http().post('/auth/sign-up').send(body).expect(201);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: body.email },
      });
      expect(user.password).not.toBe(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, user.password)).toBe(true);
    });

    it('does not allow choosing a role (no privilege escalation at sign-up)', async () => {
      await http()
        .post('/auth/sign-up')
        .send({ ...body, role: 'ADMIN' })
        .expect(400);

      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects a duplicated email', async () => {
      await http().post('/auth/sign-up').send(body).expect(201);
      await http().post('/auth/sign-up').send(body).expect(400);
    });

    it.each([
      ['invalid email', { ...body, email: 'not-an-email' }],
      ['missing name', { email: body.email, password: PASSWORD }],
      ['missing password', { name: body.name, email: body.email }],
    ])('rejects %s', async (_label, payload) => {
      await http().post('/auth/sign-up').send(payload).expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access token and the user without password', async () => {
      const writer = await createUser(app, prisma, 'writer', 'WRITER');

      const res = await http()
        .post('/auth/login')
        .send({ email: writer.email, password: PASSWORD })
        .expect(201);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({ id: writer.id, role: 'WRITER' });
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('rejects a wrong password and an unknown email with the same 401', async () => {
      const reader = await createUser(app, prisma, 'reader', 'READER');

      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: reader.email, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'nobody@test.com', password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /auth/profile', () => {
    it('returns the logged user without password', async () => {
      const editor = await createUser(app, prisma, 'editor', 'EDITOR');

      const res = await http()
        .get('/auth/profile')
        .set('Authorization', bearer(editor))
        .expect(200);

      expect(res.body).toMatchObject({ id: editor.id, role: 'EDITOR' });
      expect(res.body).not.toHaveProperty('password');
    });
  });
});
