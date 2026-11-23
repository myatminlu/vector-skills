/** Auth checks: sign in with the QA account (QA_EMAIL / QA_PASSWORD), then the session and the Saved example. */
export const order = 10;

export async function setup(ctx) {
  const email = process.env.QA_EMAIL ?? 'demo@example.com';
  const password = process.env.QA_PASSWORD ?? 'demo1234';
  const login = await ctx.call({ method: 'POST', path: '/auth/login', auth: false, body: { email, password } });
  ctx.token = login.json?.accessToken ?? null;
  console.log(`${login.status === 200 ? '✔' : '✖'} POST /auth/login → ${login.status} · ${ctx.shape(login.json)}`);
  if (!ctx.token) console.log('   (no access token — authenticated checks will fail; check QA_EMAIL / QA_PASSWORD)');
}

export const checks = [
  { method: 'GET', path: '/auth/me' },
  { method: 'GET', path: '/me/saved' },
  { method: 'POST', path: '/me/saved', body: (vars) => ({ itemId: vars.itemId }), expect: [200, 201] },
  { method: 'DELETE', path: '/me/saved/{itemId}', expect: [200, 204] },
  { method: 'GET', path: '/me/saved', auth: 'bad-token', expect: 401 },
];
