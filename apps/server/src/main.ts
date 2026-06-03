import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const webOrigin = configService.get<string>('WEB_ORIGIN') || 'http://localhost:5173';
  const port = Number(configService.get<string>('SERVER_PORT') || 3000);

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
