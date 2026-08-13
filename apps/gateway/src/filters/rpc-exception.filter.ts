import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { normalizeRpcError } from '../common/rpc/rpc.util';

interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
  [key: string]: unknown;
}

/**
 * Translates internal-service RPC failures (and any other exception) into
 * the NestJS error shape the OpenAPI contract specifies. Extra payload
 * fields (conflictSeatIds, paymentStatus, ...) are preserved on the body.
 */
@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body, error: HttpStatus[status] }
            : body,
        );
      return;
    }

    const rpc = normalizeRpcError(exception);
    const payload = rpc.getError() as RpcErrorPayload;
    response.status(payload.statusCode).json(payload);
  }
}
