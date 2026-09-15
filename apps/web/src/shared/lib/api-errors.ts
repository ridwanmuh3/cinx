import { ApiError } from '@/shared/api';

/**
 * Translates a failed request into copy a moviegoer can act on. Technical
 * detail ("Request failed (500)") stays available to engineering; the UI
 * speaks in outcomes and next steps instead.
 *
 * Validation payloads (400/422) are passed through — the backend messages
 * there are already human-readable and field-specific.
 */
export function describeApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(err instanceof Error)) return fallback;

  const raw = err.message?.trim() ?? '';
  if (!raw) return fallback;

  // Transport-level failures surface as TypeError in the fetch pipeline.
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'We could not reach the cinema network. Check your connection and try again.';
  }

  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 400:
        return raw;
      case 401:
        return 'Your session ended. Sign in again to continue.';
      case 403:
        return "You don't have access to do that.";
      case 404:
        return "We couldn't find that. It may have been removed.";
      case 409:
        return 'Someone was just a step ahead — that was taken while you were choosing. Refresh and try again.';
      case 410:
        return 'Your hold expired and the seats were released. Pick your seats again.';
      case 422:
        return raw;
      case 429:
        return 'Too many attempts. Take a breath and try again in a moment.';
      default:
        if (err.statusCode >= 500) {
          return 'Something went wrong on our side. Please try again in a moment.';
        }
        return isGenericTransportCopy(raw) ? fallback : raw;
    }
  }

  return isGenericTransportCopy(raw) ? fallback : raw;
}

/** True when the message is our own generic transport string, not user info. */
function isGenericTransportCopy(raw: string): boolean {
  return /request failed \(\d+\)/i.test(raw);
}
