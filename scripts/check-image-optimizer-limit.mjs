import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchInternalImage } = require('next/dist/server/image-optimizer');

const responseLimit = 1024 * 1024;
const chunk = Buffer.alloc(64 * 1024, 0x89);
const request = { method: 'GET', socket: null };

function syntheticHandler(chunkCount) {
  return async (_request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'image/png');
    for (let index = 0; index < chunkCount; index += 1) {
      response.write(chunk);
    }
    response.end();
  };
}

const control = await fetchInternalImage(
  '/synthetic-small-image.png',
  request,
  {},
  responseLimit,
  syntheticHandler(1),
);
assert.equal(control.buffer.length, chunk.length);
assert.equal(control.contentType, 'image/png');

await assert.rejects(
  fetchInternalImage(
    '/synthetic-oversized-image.png',
    request,
    {},
    responseLimit,
    syntheticHandler(17),
  ),
  (error) => error.statusCode === 413,
  'oversized local image responses should stop at the configured byte limit',
);

console.log('Image optimizer size limit passed: small control accepted, oversized local response rejected.');
