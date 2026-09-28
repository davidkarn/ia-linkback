// Start the API (from src/):  DATABASE_URL=postgres://... [PORT=3000] npx tsx api/main.ts
// In development, `npm run dev` restarts it whenever a file it imports (or .env) changes.
// DATABASE_URL and OPENROUTER_KEY (for page insights) can also come from .env.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const bootstrap = async() => {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
};

bootstrap();
