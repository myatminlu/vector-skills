// `EXPO_PUBLIC_*` values are inlined by Babel at bundle time, and only for static `process.env.EXPO_PUBLIC_NAME`
// expressions — `process.env[name]` stays dynamic and is undefined in a release bundle while working in development.
// So every read below is a literal property access, and nothing else in the app reads `process.env`.

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredApiUrl || !/^https?:\/\//i.test(configuredApiUrl)) {
  throw new Error('EXPO_PUBLIC_API_URL must be configured with a valid http(s) URL. Copy .env.example to .env.');
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const API_BASE_URL = configuredApiUrl.replace(/\/$/, '');
export const API_PREFIX = (clean(process.env.EXPO_PUBLIC_API_PREFIX) ?? '/api/v1').replace(/\/$/, '');
/** Requests per second the client lets through (`lib/api/scheduler`); the backend's limit, not a guess. */
export const API_RATE_PER_SECOND = positiveNumber(process.env.EXPO_PUBLIC_API_RATE_PER_SECOND, 5);

/** Shown in Account and used as the persisted-cache buster; `npm run bump -- --version x.y.z` keeps it in step with app.json. */
export const APP_VERSION = '1.0.0';

/** Build-time only (never in .env): a screenshot tour over every route, signed in as the QA account. */
export const QA_TOUR_ENABLED = process.env.EXPO_PUBLIC_QA_TOUR === '1';
export const QA_EMAIL = clean(process.env.EXPO_PUBLIC_QA_EMAIL);
export const QA_PASSWORD = clean(process.env.EXPO_PUBLIC_QA_PASSWORD);
