# Investment Tool PWA

Static, installable client that will replace the Apps Script presentation layer after live-data
parity and privacy checks pass. The existing private Apps Script app remains the working fallback.

## Current slice

- responsive Watchlist and Stock Detail shell;
- `BUY / WAIT / AVOID` filtering and four sort modes;
- install manifest, standalone display, app icons, and safe shell-only service worker;
- online/offline status and explicit no-private-cache behavior;
- install and **Analyze in ChatGPT** entry points;
- synthetic `?demo=1` mode for local UI verification;
- Google Identity Services token flow with the least-privilege `spreadsheets.readonly` scope;
- direct, read-only Google Sheets `values:batchGet` access with strict Tracker-contract checks;
- access tokens and private Tracker rows held only in memory;
- device configuration kept out of source control;
- private one-click setup links for additional phones and browsers.

The OAuth code path is complete. A Google Web OAuth Client must still be created/configured with the
eventual GitHub Pages origin before the first live browser authorization and parity test.

## Local configuration

Use **Einstellungen** in the PWA to save the Google Web OAuth Client ID, private Tracker URL/ID, and
optional Custom-GPT link in that browser. A developer can alternatively copy `config.example.js` to
`config.local.js` for an uncommitted local setup. The public bundle must never contain the Tracker ID,
OAuth tokens, Apps Script deployment URLs, private snapshots, or credentials.

For another device, use **Privaten Einrichtungslink kopieren** in Settings. The configuration is
encoded only in the URL fragment, which browsers do not send to GitHub Pages. The app imports it into
that browser and immediately removes the fragment from the address bar. The link contains identifiers,
not passwords or tokens, but must still be shared only through a private channel.

## Privacy boundary

The service worker caches only the static app shell and synthetic demo module. It ignores local
configuration and does not intercept Google Identity, Sheets, or Apps Script requests. Private Tracker
data and short-lived OAuth tokens stay in memory and are unavailable offline. The device stores only
the non-secret OAuth Client ID, the private spreadsheet identifier, and the optional GPT URL.
