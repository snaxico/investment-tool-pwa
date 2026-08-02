import assert from "node:assert/strict";
import test from "node:test";
import { GoogleAuthError, GoogleAuthSession, SHEETS_READONLY_SCOPE } from "../src/google-auth.mjs";

test("rejects malformed OAuth client identifiers", () => {
  assert.throws(() => new GoogleAuthSession("secret"), GoogleAuthError);
});

test("requests only the Sheets read-only scope and retains the token in memory", async () => {
  let clientConfig;
  const fakeWindow = {
    setTimeout,
    google: { accounts: { oauth2: {
      initTokenClient(config) {
        clientConfig = config;
        return { requestAccessToken() { config.callback({ access_token: "token", expires_in: 3600 }); } };
      }
    } } }
  };
  const session = new GoogleAuthSession("123-example.apps.googleusercontent.com", { windowRef: fakeWindow, now: () => 1000 });
  assert.equal(await session.connect(), "token");
  assert.equal(clientConfig.scope, SHEETS_READONLY_SCOPE);
  assert.equal(session.getAccessToken(), "token");
});
