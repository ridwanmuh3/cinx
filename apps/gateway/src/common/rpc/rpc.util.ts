import { RpcException } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
  [key: string]: unknown;
}

function isRpcErrorPayload(err: unknown): err is RpcErrorPayload {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { statusCode?: unknown }).statusCode === 'number'
  );
}

/**
 * Errors thrown by a remote service arrive at the gateway as plain objects
 * (the RPC payload) rather than RpcException instances. Normalise every
 * shape we can get back into an RpcException the global filter understands:
 *   - RpcException instance
 *   - the RPC error payload directly
 *   - the serialized RpcException `{ name, error: { statusCode, ... } }`
 */
export function normalizeRpcError(err: unknown): RpcException {
  if (err instanceof RpcException) {
    return err;
  }
  if (isRpcErrorPayload(err)) {
    return new RpcException(err);
  }
  if (typeof err === 'object' && err !== null) {
    const error = (err as { error?: unknown }).error;
    if (isRpcErrorPayload(error)) {
      return new RpcException(error);
    }
  }
  return new RpcException({
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error',
  });
}

export async function rpcSend<T>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
): Promise<T> {
  try {
    return await firstValueFrom(client.send<T>(pattern, payload));
  } catch (err) {
    throw normalizeRpcError(err);
  }
}
