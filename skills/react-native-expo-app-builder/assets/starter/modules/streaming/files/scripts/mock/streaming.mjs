/**
 * Streaming endpoint: `POST /ask` answers with server-sent events, word by word. With the auth module it needs a
 * signed-in user. Switches: MOCK_ASK_ENABLED=0 (403, and the remote switch off), MOCK_ASK_ERROR=1 (an error event mid-stream).
 */
export const order = 40;

const ASK_ENABLED = process.env.MOCK_ASK_ENABLED !== '0';
const ASK_ERROR = process.env.MOCK_ASK_ERROR === '1';

async function streamAnswer(res, question, item) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const intro = item ? `About "${item.title}": ` : '';
  const words = `${intro}this is a mock answer to "${question}". A real backend would send your question to the AI provider and stream its reply here, word by word.`.split(' ');
  res.write(': connected\n\n');
  for (const [index, word] of words.entries()) {
    if (res.destroyed) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
    res.write(`data: ${JSON.stringify({ type: 'delta', text: (index ? ' ' : '') + word })}\n\n`);
    if (ASK_ERROR && index === 5) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'The AI provider is not available right now.', code: 'PROVIDER_UNAVAILABLE' })}\n\n`);
      res.end();
      return;
    }
  }
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

export function register(app) {
  app.items.push({ id: 'streaming', title: 'Streaming answers', summary: 'Server-sent events, read as they arrive.', body: 'The Ask screen reads an event stream with expo/fetch. Errors can arrive as an HTTP status or as an error event inside a 200 response; both end up as ApiError.' });

  app.route('POST', '/ask', async ({ req, res, userId }) => {
    if (app.hasAuth && !userId) return app.fail(res, 401, 'UNAUTHORIZED', 'Missing or expired access token');
    if (!ASK_ENABLED) return app.fail(res, 403, 'FEATURE_DISABLED', 'Asking is switched off');
    const body = await app.readJson(req);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) return app.fail(res, 400, 'VALIDATION', ['question should not be empty']);
    return streamAnswer(res, question, app.items.find((entry) => entry.id === body.itemId));
  });
}
