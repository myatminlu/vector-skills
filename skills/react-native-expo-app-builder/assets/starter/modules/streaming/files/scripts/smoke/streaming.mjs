/** Streaming check: one short question; the answer must be an event stream with at least one `data:` line. */
export const order = 40;

export const checks = [{ method: 'POST', path: '/ask', body: (vars) => ({ question: 'ping', itemId: vars.itemId }), stream: true }];
