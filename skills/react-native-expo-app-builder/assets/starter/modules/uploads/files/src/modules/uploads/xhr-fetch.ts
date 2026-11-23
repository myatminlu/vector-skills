/**
 * fetch-compatible multipart transport built on React Native's XMLHttpRequest.
 *
 * Expo replaces the global `fetch` with `expo/fetch`, which rejects React Native's
 * `{ uri, name, type }` FormData parts ("Unsupported FormDataPart implementation") and would
 * buffer whole files into JS memory anyway. RN's XHR streams the part from disk natively.
 */
export function xhrFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const signal = init.signal;
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    const finish = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.open(init.method ?? 'GET', url, true);
    xhr.responseType = 'text';
    new Headers(init.headers).forEach((value, name) => xhr.setRequestHeader(name, value));

    xhr.onload = () => {
      finish();
      const emptyBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(emptyBody ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: parseHeaders(xhr.getAllResponseHeaders()) }));
    };
    xhr.onerror = () => {
      finish();
      reject(new TypeError('Network request failed'));
    };
    xhr.ontimeout = () => {
      finish();
      reject(new TypeError('Network request timed out'));
    };
    xhr.send((init.body ?? null) as XMLHttpRequestBodyInit | null);
  });
}

export function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}
