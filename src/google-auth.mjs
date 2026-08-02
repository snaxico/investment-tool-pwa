export const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export class GoogleAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function validClientId(value) {
  return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(value || "").trim());
}

export async function waitForGoogleIdentity(windowRef = globalThis.window, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (!windowRef.google?.accounts?.oauth2) {
    if (Date.now() - startedAt >= timeoutMs) throw new GoogleAuthError("Google Identity Services could not be loaded.");
    await new Promise(resolve => windowRef.setTimeout(resolve, 50));
  }
  return windowRef.google;
}

export class GoogleAuthSession {
  constructor(clientId, { windowRef = globalThis.window, now = () => Date.now() } = {}) {
    if (!validClientId(clientId)) throw new GoogleAuthError("A valid Google Web OAuth Client ID is required.");
    this.clientId = clientId;
    this.windowRef = windowRef;
    this.now = now;
    this.tokenClient = null;
    this.token = "";
    this.expiresAt = 0;
    this.pending = null;
  }

  async initialize() {
    if (this.tokenClient) return;
    const google = await waitForGoogleIdentity(this.windowRef);
    this.google = google;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SHEETS_READONLY_SCOPE,
      include_granted_scopes: true,
      callback: response => this.handleResponse(response),
      error_callback: error => this.handleError(error)
    });
  }

  async connect() {
    await this.initialize();
    if (this.pending) return this.pending.promise;
    let resolvePending;
    let rejectPending;
    const promise = new Promise((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    this.pending = { promise, resolve: resolvePending, reject: rejectPending };
    this.tokenClient.requestAccessToken({ prompt: "" });
    return promise;
  }

  handleResponse(response) {
    const pending = this.pending;
    this.pending = null;
    if (!response?.access_token || response.error) {
      pending?.reject(new GoogleAuthError("Google authorization was not completed."));
      return;
    }
    this.token = response.access_token;
    this.expiresAt = this.now() + Math.max(0, Number(response.expires_in || 0) - 30) * 1000;
    pending?.resolve(this.token);
  }

  handleError(error) {
    const pending = this.pending;
    this.pending = null;
    const message = error?.type === "popup_closed"
      ? "Google authorization was closed before completion."
      : "Google authorization could not be opened.";
    pending?.reject(new GoogleAuthError(message));
  }

  getAccessToken() {
    if (!this.token || this.now() >= this.expiresAt) return "";
    return this.token;
  }

  disconnect() {
    if (this.token && this.google?.accounts?.oauth2?.revoke) this.google.accounts.oauth2.revoke(this.token, () => {});
    this.token = "";
    this.expiresAt = 0;
  }
}
