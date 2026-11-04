import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'secret123';
// Low cost factor: seeding users must be fast. Production uses 10.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  setupApp(app); // same ValidationPipe as main.ts
  await app.init();
  return app;
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // Safety net: never truncate anything but the dedicated test database.
  const [{ current_database: dbName }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${dbName}"`);
  }
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Post", "User" CASCADE');
}

/** Inserts a user with the given role and logs in through the real endpoint. */
export async function createUser(
  app: INestApplication,
  prisma: PrismaService,
  name: string,
  role: Role,
): Promise<TestUser> {
  const email = `${name}@test.com`;
  const user = await prisma.user.create({
    data: { name, email, password: PASSWORD_HASH, role },
  });

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);

  return { id: user.id, email, role, token: res.body.accessToken as string };
}

export const bearer = (user: TestUser) => `Bearer ${user.token}`;

export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
