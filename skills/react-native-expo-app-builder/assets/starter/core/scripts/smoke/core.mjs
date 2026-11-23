/** Core checks: health and the example's public items. `{id}` segments are filled from earlier answers (`capture`). */
export const order = 0;

export const checks = [
  { method: 'GET', path: '/health', auth: false },
  // The app's connectivity probe: a HEAD that must answer 2xx, or the app shows "offline" whenever the OS is unsure.
  { method: 'HEAD', path: '/health', auth: false },
  { method: 'GET', path: '/items?limit=5', auth: false, capture: (body, vars) => (vars.itemId = body?.items?.[0]?.id) },
  { method: 'GET', path: '/items/{itemId}', auth: false },
  { method: 'GET', path: '/items/does-not-exist', auth: false, expect: 404 },
];
