import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import env from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_DATABASE}`,
    });
    super({ adapter,  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : [],});
  }
}
