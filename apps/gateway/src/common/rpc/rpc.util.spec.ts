import { RpcException } from '@nestjs/microservices';
import { normalizeRpcError } from './rpc.util';

describe('normalizeRpcError', () => {
  it('passes RpcException instances through unchanged', () => {
    const original = new RpcException({
      statusCode: 422,
      message: 'nope',
      error: 'x',
    });
    expect(normalizeRpcError(original)).toBe(original);
  });

  it('wraps a raw RPC error payload', () => {
    const err = normalizeRpcError({
      statusCode: 409,
      message: 'Some seats are already held',
      error: 'Conflict',
      conflictSeatIds: ['s1'],
    });
    expect(err).toBeInstanceOf(RpcException);
    expect(err.getError()).toEqual({
      statusCode: 409,
      message: 'Some seats are already held',
      error: 'Conflict',
      conflictSeatIds: ['s1'],
    });
  });

  it('unwraps a serialized RpcException (as received over TCP)', () => {
    const err = normalizeRpcError({
      name: 'RpcException',
      error: {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      },
    });
    expect(err.getError()).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
      error: 'Unauthorized',
    });
  });

  it('falls back to a 500 for unknown errors', () => {
    const err = normalizeRpcError(new Error('boom'));
    expect(err.getError()).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });
});
