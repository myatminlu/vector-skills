import type { components } from './openapi';

/**
 * API types, derived from the generated OpenAPI types (`src/types/openapi.d.ts`, from `docs/openapi.json` via
 * `npm run api:types`) — one description of the contract, not two. When the backend publishes its own OpenAPI file,
 * point `OPENAPI_SPEC` at it, regenerate, and fix whatever stops compiling: that is the contract changing.
 */
type Schemas = components['schemas'];

export type User = Schemas['User'];
export type AuthResponse = Schemas['AuthResponse'];
export type Item = Schemas['Item'];
export type SavedItem = Schemas['SavedItem'];
export type AppConfig = Schemas['AppConfig'];
/** One event of `POST /ask` (server-sent events). */
export type AskEvent = Schemas['AskEvent'];

export type Page<T> = { items: T[]; total: number };
