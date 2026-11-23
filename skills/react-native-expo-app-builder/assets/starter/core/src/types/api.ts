import type { components } from './openapi';

/**
 * API types, derived from the generated OpenAPI types (`src/types/openapi.d.ts`, from `docs/openapi.json` via
 * `npm run api:types`) — one description of the contract, not two. Modules derive theirs the same way in their own
 * `types.ts`. When the backend publishes its own OpenAPI file, point `OPENAPI_SPEC` at it, regenerate, and fix whatever
 * stops compiling: that is the contract changing.
 */
type Schemas = components['schemas'];

export type Item = Schemas['Item'];

export type Page<T> = { items: T[]; total: number };
