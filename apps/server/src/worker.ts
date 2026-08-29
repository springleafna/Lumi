import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { createLumiLogger } from './common/logger/winston.factory';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLumiLogger('worker'),
  });
  Logger.log('Lumi worker started', 'Worker');
}

bootstrap();
