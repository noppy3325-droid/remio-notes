import test from "node:test";
import assert from "node:assert/strict";
import { parseNativeCallback } from "../src/native-auth";

test("native OAuth accepts only the exact callback", () => {
  assert.deepEqual(parseNativeCallback("remionotes://auth/callback?code=abc"), {
    code: "abc",
    error: false,
  });
  for (const value of [
    "https://auth/callback?code=abc",
    "remionotes://evil/callback?code=abc",
    "remionotes://auth/other?code=abc",
    "remionotes://user@auth/callback?code=abc",
    "remionotes://auth/callback#access_token=secret",
    "invalid",
  ]) {
    assert.equal(parseNativeCallback(value), null);
  }
  assert.deepEqual(
    parseNativeCallback("remionotes://auth/callback?error=access_denied"),
    { code: null, error: true },
  );
});
