import { LoggerService } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { utilities, WinstonModule } from 'nest-winston';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
const LOG_RETENTION = '14d';

export function createLumiLogger(processName: 'server' | 'worker'): LoggerService {
  loadLoggingEnv();

  const logsDir = resolveLogsDir();
  mkdirSync(logsDir, { recursive: true });

  return WinstonModule.createLogger({
    level: resolveLogLevel(),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          utilities.format.nestLike('Lumi', { colors: true, prettyPrint: true }),
        ),
      }),
      new DailyRotateFile({
        dirname: logsDir,
        filename: `${processName}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: LOG_RETENTION,
        zippedArchive: false,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(printFileLine),
        ),
      }),
    ],
  });
}

function printFileLine(info: winston.Logform.TransformableInfo): string {
  const context = typeof info.context === 'string' ? ` [${info.context}]` : '';
  return `${info.timestamp} [${info.level}]${context} ${String(info.message)}${formatStack(info.stack)}`;
}

// nest-winston 的 error(message, trace) 会把堆栈写成数组：stack: [trace]
function formatStack(stack: unknown): string {
  const text =
    typeof stack === 'string'
      ? stack
      : Array.isArray(stack)
        ? stack.filter((line) => typeof line === 'string').join('\n')
        : '';
  return text ? `\n${text}` : '';
}

// ConfigModule 加载 .env 发生在模块初始化阶段，而 logger 需要在 NestFactory 之前构造，
// 因此这里提前读取 .env；dotenv 不会覆盖已存在的进程环境变量。
function loadLoggingEnv(): void {
  const repoRoot = findRepoRoot(__dirname);
  if (repoRoot) {
    loadEnv({ path: join(repoRoot, '.env') });
  }
  loadEnv({ path: resolve(process.cwd(), '.env') });
}

function resolveLogsDir(): string {
  const fromEnv = process.env.LOG_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);

  const repoRoot = findRepoRoot(__dirname) ?? resolve(__dirname, '../../../..');
  return join(repoRoot, 'logs');
}

function resolveLogLevel(): string {
  const level = process.env.LOG_LEVEL?.trim().toLowerCase();
  return level && (LOG_LEVELS as readonly string[]).includes(level) ? level : 'info';
}

function findRepoRoot(startDir: string): string | null {
  let current = resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}
