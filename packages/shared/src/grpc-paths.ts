import { dirname, join } from 'path';
import { existsSync } from 'fs';

// `__dirname` of the compiled grpc-paths.js:
//  - workspace: packages/shared/dist
//  - installed : <pkg>/dist
const distDir = __dirname;
const sharedRoot = dirname(distDir);

export const PROTO_DIR = join(sharedRoot, 'proto');

// Prefer the source `proto/` (dev/test workspace), fall back to the copied
// `dist/proto/` that ships in the built package.
export function protoPath(name: string): string {
  const candidates = [
    join(sharedRoot, 'proto', name),
    join(distDir, 'proto', name),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export const GRPC_STATUS = {
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  ABORTED: 10,
  UNAUTHENTICATED: 16,
  UNIMPLEMENTED: 12,
  UNAVAILABLE: 14,
} as const;

export const HTTP_TO_GRPC: Record<number, number> = {
  400: GRPC_STATUS.INVALID_ARGUMENT,
  401: GRPC_STATUS.UNAUTHENTICATED,
  403: GRPC_STATUS.PERMISSION_DENIED,
  404: GRPC_STATUS.NOT_FOUND,
  409: GRPC_STATUS.ALREADY_EXISTS,
  410: GRPC_STATUS.ABORTED,
  422: GRPC_STATUS.INVALID_ARGUMENT,
  429: GRPC_STATUS.RESOURCE_EXHAUSTED,
  500: GRPC_STATUS.UNKNOWN,
  501: GRPC_STATUS.UNIMPLEMENTED,
  503: GRPC_STATUS.UNAVAILABLE,
};

export const GRPC_TO_HTTP: Record<number, number> = {
  [GRPC_STATUS.INVALID_ARGUMENT]: 400,
  [GRPC_STATUS.PERMISSION_DENIED]: 403,
  [GRPC_STATUS.NOT_FOUND]: 404,
  [GRPC_STATUS.ALREADY_EXISTS]: 409,
  [GRPC_STATUS.RESOURCE_EXHAUSTED]: 429,
  [GRPC_STATUS.ABORTED]: 410,
  [GRPC_STATUS.UNAUTHENTICATED]: 401,
  [GRPC_STATUS.UNIMPLEMENTED]: 501,
  [GRPC_STATUS.UNAVAILABLE]: 503,
  [GRPC_STATUS.UNKNOWN]: 500,
};

export function httpToGrpcCode(statusCode: number): number {
  return HTTP_TO_GRPC[statusCode] ?? GRPC_STATUS.UNKNOWN;
}
