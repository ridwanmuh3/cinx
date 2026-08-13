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
