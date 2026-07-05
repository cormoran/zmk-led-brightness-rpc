// jest-dom adds custom jest matchers for asserting on DOM nodes.
import "@testing-library/jest-dom";

// jsdom's global scope does not provide TextEncoder/TextDecoder (they come
// from Node's `util` module outside of jsdom). protobufjs/@bufbuild's wire
// encoding needs them to encode/decode proto messages -- polyfill from
// Node's `util` so `Request.encode()`/`Response.decode()` work under the
// jsdom test environment.
import { TextEncoder, TextDecoder } from "node:util";

if (typeof globalThis.TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.TextEncoder = TextEncoder as any;
}
if (typeof globalThis.TextDecoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.TextDecoder = TextDecoder as any;
}
