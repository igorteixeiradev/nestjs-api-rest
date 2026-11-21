import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Global configuration shared by the real app (main.ts) and the e2e tests,
 * so the tests run with exactly the same pipes as production.
 */
export function setupApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that are not in the DTO
      forbidNonWhitelisted: true, // ...and reject the request instead
      transform: true, // run @Type() so query params become numbers
    }),
  );
}
