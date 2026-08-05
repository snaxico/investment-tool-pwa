import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DEFAULT_APPS_SCRIPT_DEPLOYMENT_ID } from "../src/public-config.mjs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("manifest is installable and uses local-scope assets", () => {
  const manifest = JSON.parse(read("../manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512"));
});

test("service worker caches only the public shell", () => {
  const worker = read("../sw.js");
  assert.match(worker, /SHELL_URLS/);
  assert.match(worker, /config\.local\.js/);
  assert.match(worker, /google-auth\.mjs/);
  assert.match(worker, /device-setup\.mjs/);
  assert.match(worker, /tracker-contract\.mjs/);
  assert.match(worker, /app-actions\.mjs/);
  assert.doesNotMatch(worker, /googleapis\.com|spreadsheets\/|snapshot_json|TRACKER_SPREADSHEET_ID/);
});

test("public PWA files contain no environment identifier or credential", () => {
  const publicText = ["../index.html", "../app.js", "../manifest.webmanifest", "../sw.js", "../config.example.js", "../src/device-setup.mjs", "../src/public-config.mjs"].map(read).join("\n");
  assert.match(publicText, new RegExp(DEFAULT_APPS_SCRIPT_DEPLOYMENT_ID));
  assert.doesNotMatch(publicText, /client_secret|1nhd_xcKcuWqNwsudavhNRsm0kqy81Ujl/);
  assert.doesNotMatch(publicText, /NVDA-2026-08-02-v5\.1-slim|XNAS:NVDA/);
});

test("public page applies a restrictive content security policy", () => {
  const html = read("../index.html");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /https:\/\/sheets\.googleapis\.com/);
  assert.match(html, /https:\/\/script\.googleapis\.com/);
});

test("PWA exposes install, refresh, filter, and ChatGPT entry points", () => {
  const html = read("../index.html");
  assert.match(html, /id="install"/);
  assert.match(html, /id="analyze"/);
  assert.match(html, /id="refresh"/);
  assert.match(html, /id="connect"/);
  assert.match(html, /id="settings-form"/);
  assert.match(html, /id="copy-setup"/);
  assert.match(html, /id="apps-script-deployment-id"/);
  assert.match(html, /id="auto-update"/);
  assert.match(html, /id="auto-update-health"/);
  assert.match(html, /data-view="ARCHIVE"/);
  assert.match(html, /id="archive-list"/);
  assert.match(html, /accounts\.google\.com\/gsi\/client/);
  assert.match(html, /data-filter="BUY"/);
  assert.match(html, /manifest\.webmanifest/);
});
