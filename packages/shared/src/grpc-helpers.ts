import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom, Observable, throwError } from 'rxjs';
import { httpToGrpcCode, GRPC_TO_HTTP, GRPC_STATUS } from './grpc-paths';
import { RpcErrorPayload, rpcErrorPayload } from './contracts/rpc';

export { GRPC_STATUS, GRPC_TO_HTTP, httpToGrpcCode };

export interface GrpcLikeError {
  code?: number;
  message?: string;
  details?: string;
  metadata?: unknown;
  name?: string;
}

/**
 * Maps any exception into a gRPC status error carrying the serialized RPC
 * payload in `details`. Returns an erroring Observable (the Nest RPC filter
 * contract) — throwing inside the filter would crash the microservice.
 */
@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  catch(
    exception: unknown,
    // ArgumentsHost unused: RPC errors are rethrown into the Observable, not written to a response.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _host: ArgumentsHost,
  ): Observable<never> {
    const payload = toRpcPayload(exception);
    const code = httpToGrpcCode(payload.statusCode);
    const details = JSON.stringify(payload);
    const err: GrpcLikeError & { [k: string]: unknown } = new Error(
      details,
    ) as GrpcLikeError & { [k: string]: unknown };
    err.name = 'RpcException';
    err.code = code;
    err.details = details;
    return throwError(() => err);
  }
}

function toRpcPayload(exception: unknown): RpcErrorPayload {
  if (exception instanceof RpcException) {
    const e = exception.getError();
    if (typeof e === 'object' && e !== null && 'statusCode' in e) {
      return e as RpcErrorPayload;
    }
    if (typeof e === 'string') return rpcErrorPayload(500, e);
    return rpcErrorPayload(500, 'Internal server error');
  }
  if (exception && typeof exception === 'object') {
    const e = exception as {
      statusCode?: unknown;
      message?: unknown;
      getResponse?: () => unknown;
    };
    if (typeof e.statusCode === 'number') return e as RpcErrorPayload;
    if (typeof e.getResponse === 'function') {
      const body = e.getResponse();
      if (typeof body === 'object' && body !== null && 'statusCode' in body) {
        return body as RpcErrorPayload;
      }
    }
    if (typeof e.message === 'string') return rpcErrorPayload(500, e.message);
  }
  return rpcErrorPayload(500, 'Internal server error');
}

export async function grpcSend<T>(observable: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(observable);
  } catch (err: unknown) {
    throw new RpcException(grpcErrorToPayload(err as GrpcLikeError));
  }
}

function grpcErrorToPayload(err: GrpcLikeError): RpcErrorPayload {
  const details = err.details ?? err.message;
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.statusCode === 'number'
      ) {
        return parsed as RpcErrorPayload;
      }
    } catch {
      /* not JSON — fall through */
    }
  }
  const code = typeof err.code === 'number' ? err.code : undefined;
  const httpStatus = code !== undefined ? GRPC_TO_HTTP[code] : 500;
  return rpcErrorPayload(httpStatus, err.message ?? 'Internal server error');
}
