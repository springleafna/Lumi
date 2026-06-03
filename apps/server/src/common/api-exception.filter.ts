import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    response.status(status).json({
      code: getErrorCode(status, exceptionResponse),
      message: getErrorMessage(exception, exceptionResponse),
      data: null,
    });
  }
}

function getErrorCode(status: number, response: unknown): string {
  if (isObjectResponse(response) && typeof response.code === 'string') {
    return response.code;
  }

  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
  return 'INTERNAL_ERROR';
}

function getErrorMessage(exception: unknown, response: unknown): string {
  if (isObjectResponse(response)) {
    const message = response.message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string') return message;
  }

  if (typeof response === 'string') return response;
  if (exception instanceof Error) return exception.message;
  return '请求失败';
}

function isObjectResponse(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
