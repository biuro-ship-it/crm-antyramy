// Polyfill Web API globals dla Node.js < 18 (wymagane przez gaxios v6 / googleapis v171+)
if (typeof globalThis.Headers === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFetch = require('node-fetch');
  globalThis.fetch = nodeFetch.default;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

if (typeof globalThis.Blob === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  globalThis.Blob = require('buffer').Blob;
}
