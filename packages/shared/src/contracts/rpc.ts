import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RpcException } from '@nestjs/microservices';

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

export interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
  [key: string]: unknown;
}

export function rpcErrorPayload(
  statusCode: number,
  message: string | string[],
  extra?: Record<string, unknown>,
): RpcErrorPayload {
  return {
    statusCode,
    message,
    error: STATUS_TEXT[statusCode] ?? 'Error',
    ...extra,
  };
}

type ClassConstructor<T> = new (...args: unknown[]) => T;

// gRPC handlers are not auto-validated by NestJS, so validate DTOs explicitly.
export async function validateDto(
  input: unknown,
  cls: ClassConstructor<unknown>,
): Promise<void> {
  const instance = plainToInstance(cls, input, { excludeExtraneousValues: false });
  const errors = await validate(instance as object);
  if (errors.length) {
    throw new RpcException(
      rpcErrorPayload(
        400,
        errors
          .flatMap((e) => Object.values(e.constraints ?? {}))
          .filter(Boolean) as string[],
        { invalidParams: errors.map((e) => e.property) },
      ),
    );
  }
}
