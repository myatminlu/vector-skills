/** Core endpoints: health and the example's public items. */
export const order = 0;

export function register(app) {
  app.items.push(
    { id: '1', title: 'Getting started', summary: 'What this starter already does for you.', body: 'The API client, offline banner, text primitives, languages and a test harness are wired. Each installed module adds its own part. Replace this content with your own.' },
    { id: '2', title: 'Offline', summary: 'The app says when the network is gone.', body: 'Switch the network off: a banner appears, and requests resume when it comes back. With the offline-cache module this list also stays readable.' },
  );

  app.route('GET', '/health', ({ res }) => app.send(res, 200, { ok: true }));

  app.route('GET', '/items', ({ res, query }) => {
    const limit = Math.min(Number(query.get('limit') ?? 20), 100);
    const page = Math.max(Number(query.get('page') ?? 1), 1);
    app.send(res, 200, { items: app.items.slice((page - 1) * limit, page * limit), total: app.items.length });
  });

  app.route('GET', /^\/items\/([^/]+)$/, ({ res, match }) => {
    const item = app.items.find((entry) => entry.id === decodeURIComponent(match[1]));
    if (item) app.send(res, 200, item);
    else app.fail(res, 404, 'NOT_FOUND', 'Item not found');
  });
}
