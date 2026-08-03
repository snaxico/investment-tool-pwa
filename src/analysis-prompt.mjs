const TICKER_PATTERN = /^[A-Z0-9.^:_-]{1,24}$/;

export function normalizeAnalysisTicker(value) {
  const ticker = String(value ?? "").trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) {
    throw new Error("Bitte einen gültigen Ticker eingeben, zum Beispiel NVDA, SAP oder BRK.B.");
  }
  return ticker;
}

export function buildFullAnalysisPrompt(value) {
  const ticker = normalizeAnalysisTicker(value);
  return `Analyze ${ticker} based on the methodology and execute the work Flow.`;
}
