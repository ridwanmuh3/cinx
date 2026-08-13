export const HealthPatterns = {
  PING: 'health.ping',
} as const;

export interface HealthResponse {
  service: string;
  status: 'ok';
  timestamp: string;
}
