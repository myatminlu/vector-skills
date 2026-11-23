import type { components } from '@/types/openapi';

/** The auth module's API types, derived from the generated OpenAPI types like the core's (`src/types/api.ts`). */
type Schemas = components['schemas'];

export type User = Schemas['User'];
export type AuthResponse = Schemas['AuthResponse'];
export type SavedItem = Schemas['SavedItem'];
