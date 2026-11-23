/** Guest browsing needs no endpoint of its own — public endpoints are what a guest sees. This adds an item about it. */
export const order = 20;

export function register(app) {
  app.items.push({ id: 'guest', title: 'Guest browsing', summary: 'Public content works without an account.', body: 'App Store guideline 5.1.1(v): features that are not account-based must work without a login. Account-only actions ask for an account at the moment they are used.' });
}
