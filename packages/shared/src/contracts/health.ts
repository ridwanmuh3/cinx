export const HealthPatterns = {
  PING: 'Ping',
} as const;

export interface HealthResponse {
  service: string;
  status: 'ok';
  timestamp: string;
}
