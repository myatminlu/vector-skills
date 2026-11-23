import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHeaders } from './xhr-fetch';

test('parseHeaders lowercases names and trims values', () => {
  assert.deepEqual(parseHeaders('Content-Type: application/json; charset=utf-8\r\nX-Trace-Id:  abc \r\n\r\n'), { 'content-type': 'application/json; charset=utf-8', 'x-trace-id': 'abc' });
});
