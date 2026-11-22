import 'dotenv/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap() {
const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'), { prefix: '/uploads' });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Travel Platform API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
