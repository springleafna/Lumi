import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
  Logger.log('Lumi worker started', 'Worker');
}

bootstrap();
