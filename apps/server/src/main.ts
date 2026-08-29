import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { createLumiLogger } from './common/logger/winston.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createLumiLogger('server'),
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const webOrigin = configService.get<string>('WEB_ORIGIN') || 'http://localhost:5173';
  const port = Number(configService.get<string>('SERVER_PORT') || 3000);

  app.use(json({ limit: '6mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  await app.listen(port);
}
bootstrap();
