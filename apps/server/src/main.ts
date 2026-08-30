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
  // WEB_ORIGIN 支持逗号分隔多个来源；Capacitor/移动 WebView 的默认源与
  // 常用开发端口（web 5173 / mobile 5175）始终放行。
  const corsOrigins = Array.from(
    new Set([
      ...webOrigin
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
      'http://localhost:5173',
      'http://localhost:5175',
    ]),
  );

  app.use(json({ limit: '6mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  await app.listen(port);
}
bootstrap();
