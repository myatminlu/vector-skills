/** `GET /app-config`: remote switches. MOCK_ASK_ENABLED=0 turns `ask.enabled` off (the Ask button disappears within a minute). */
export const order = 30;

export function register(app) {
  app.items.push({ id: 'remote', title: 'Remote switches', summary: 'Hide a feature without a release.', body: 'GET /app-config returns flags such as ask.enabled. Run the mock with MOCK_ASK_ENABLED=0 and the switch turns off within a minute.' });
  app.route('GET', '/app-config', ({ res }) => app.send(res, 200, { config: { 'ask.enabled': process.env.MOCK_ASK_ENABLED !== '0' } }));
}
