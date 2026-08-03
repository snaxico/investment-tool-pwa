export const APPS_SCRIPT_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export class AppsScriptActionError extends Error {
  constructor(message, status = 0) { super(message); this.name = "AppsScriptActionError"; this.status = status; }
}

export function normalizeDeploymentId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : "";
}

export async function runAppsScriptAction({ accessToken, deploymentId, request, fetchImpl = fetch }) {
  const normalizedId = normalizeDeploymentId(deploymentId);
  if (!accessToken) throw new AppsScriptActionError("Google write authorization is required.", 401);
  if (!normalizedId) throw new AppsScriptActionError("The private Apps Script deployment ID is not configured.");
  const response = await fetchImpl(`https://script.googleapis.com/v1/scripts/${encodeURIComponent(normalizedId)}:run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ function: "runAppAction", parameters: [request], devMode: false }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) throw new AppsScriptActionError("The private Apps Script action could not be executed.", response.status);
  const payload = await response.json();
  if (payload.error) {
    const message = String(payload.error.details?.[0]?.errorMessage || payload.error.message || "Apps Script action failed.").slice(0, 300);
    throw new AppsScriptActionError(message);
  }
  return payload.response?.result ?? null;
}
