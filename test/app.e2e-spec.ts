import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  createUser,
  resetDatabase,
  UNKNOWN_ID,
} from './helpers.js';

describe('Global AuthGuard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const protectedRoutes: [string, string][] = [
    ['get', '/auth/profile'],
    ['get', '/users'],
    ['post', '/users'],
    ['get', `/users/${UNKNOWN_ID}`],
    ['patch', `/users/${UNKNOWN_ID}`],
    ['delete', `/users/${UNKNOWN_ID}`],
    ['get', '/posts'],
    ['post', '/posts'],
    ['get', `/posts/${UNKNOWN_ID}`],
    ['patch', `/posts/${UNKNOWN_ID}`],
    ['delete', `/posts/${UNKNOWN_ID}`],
  ];

  it.each(protectedRoutes)(
    '%s %s without token -> 401',
    async (method, url) => {
      await request(app.getHttpServer())[method as 'get'](url).expect(401);
    },
  );

  it('rejects a malformed token with 401', async () => {
    await request(app.getHttpServer())
      .get('/posts')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });

  it('rejects a valid token whose user no longer exists with 401', async () => {
    const reader = await createUser(app, prisma, 'ghost', 'READER');
    await prisma.user.delete({ where: { id: reader.id } });

    await request(app.getHttpServer())
      .get('/posts')
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(401);
  });

  it('keeps /auth/login and /auth/sign-up public', async () => {
    // reaches the handler (401 invalid credentials / 400 validation), not the guard's "No token provided"
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'x' })
      .expect(401);
    expect(login.body.message).toBe('Invalid credentials');

    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({})
      .expect(400);
  });
});
