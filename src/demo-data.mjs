const analyzedAt = "2026-08-02T10:00:00Z";

export const DEMO_STOCKS = Object.freeze([
  {
    ticker: "ACRN", company: "Acorn Systems", price: 48.2, currency: "USD",
    stars: { fundamentals: "★", sentiment: "☆", setup: "★" }, score: 2, action: "BUY",
    priceZone: "BUY", riskReward: 2.1, sentimentPhase: "NARRATIVE_RESET",
    relativeStrengthPp: -4.2, earningsResponse: "NEUTRAL", analyzedAt,
    instrumentId: "XNAS:ACRN", benchmark: "NASDAQ:SOXX",
    primaryCatalyst: "Next product-cycle shipment milestone",
    keyRisk: "Demand conversion falls short of the current capacity plan.",
    watchItem: "Revenue conversion and gross-margin delivery in the next report."
  },
  {
    ticker: "HALO", company: "Halo Industrial", price: 126.4, currency: "EUR",
    stars: { fundamentals: "★", sentiment: "★", setup: "☆" }, score: 2, action: "WAIT",
    priceZone: "WAIT", riskReward: 1.2, sentimentPhase: "CROWDED_BULLISH",
    relativeStrengthPp: 6.8, earningsResponse: "POSITIVE", analyzedAt,
    instrumentId: "XETR:HALO", benchmark: "STOXX:600",
    primaryCatalyst: "Backlog conversion and margin expansion",
    keyRisk: "The current valuation already discounts a clean execution path.",
    watchItem: "New orders, pricing and operating-margin progression."
  },
  {
    ticker: "ORBT", company: "Orbit Mobility", price: 19.75, currency: "USD",
    stars: { fundamentals: "☆", sentiment: "☆", setup: "☆" }, score: 0, action: "AVOID",
    priceZone: "WAIT", riskReward: 0.8, sentimentPhase: "BREAKING_DOWN",
    relativeStrengthPp: -12.5, earningsResponse: "NEGATIVE", analyzedAt,
    instrumentId: "XNYS:ORBT", benchmark: "NYSE:IWM",
    primaryCatalyst: "Cash-burn reduction and production stabilization",
    keyRisk: "Additional financing dilutes shareholders before operations stabilize.",
    watchItem: "Liquidity runway and evidence of positive unit economics."
  }
]);

export function demoDetail(instrumentId) {
  const stock = DEMO_STOCKS.find(item => item.instrumentId === instrumentId);
  if (!stock) throw new Error("Unknown demo instrument");
  const snapshot = {
    instrument: { instrument_id: stock.instrumentId, trading_currency: stock.currency },
    fundamentals: {
      rationale: "Synthetic demonstration rationale. No live investment data is included in the PWA bundle.",
      growth: { assessment: stock.score ? "POSITIVE" : "NEGATIVE", note: "Synthetic growth evidence for layout testing." },
      profitability: { assessment: stock.score ? "POSITIVE" : "NEGATIVE", note: "Synthetic profitability evidence for layout testing." },
      financial_strength: { assessment: stock.action === "AVOID" ? "NEGATIVE" : "NEUTRAL", note: "Synthetic balance-sheet evidence for layout testing." },
      execution: { assessment: stock.action === "BUY" ? "POSITIVE" : "NEUTRAL", note: "Synthetic execution evidence for layout testing." }
    },
    sentiment: { rationale: "Synthetic sentiment rationale used only in local demo mode." },
    trade_setup: { rationale: "Synthetic setup rationale used only in local demo mode." },
    decision: { rationale: "Synthetic decision rationale used only in local demo mode." },
    calculations: { risk_reward: { upside_pct: stock.riskReward * 12, downside_pct: 12, ratio: stock.riskReward } },
    sources: []
  };
  const analysis = {
    analysisId: `demo-${stock.ticker}`, analyzedAt, action: stock.action, score: stock.score,
    priceZone: stock.priceZone, riskReward: stock.riskReward, referencePrice: stock.price,
    stars: stock.stars, primaryCatalyst: stock.primaryCatalyst, keyRisk: stock.keyRisk,
    watchItem: stock.watchItem, sentimentPhase: stock.sentimentPhase, snapshot,
    trackRecord: {
      action: stock.action, referencePrice: stock.price, referencePriceAt: analyzedAt,
      bearValue: Number((stock.price * .8).toFixed(2)), baseValue: Number((stock.price * 1.25).toFixed(2)),
      benchmarkId: stock.currency === "EUR" ? "MSCI_WORLD_EUR" : "MSCI_WORLD_USD",
      baseFirstObservedAt: null, bearFirstObservedAt: null, primaryOutcome: "OPEN",
      latestStockAt: analyzedAt, stockReturnPct: 6.4, benchmarkReturnPct: 3.1,
      excessPerformancePp: 3.3, state: "ACTIVE", dataStatus: "OK"
    }
  };
  return {
    stock,
    selectedAnalysis: analysis,
    currentAnalysis: analysis,
    activeHistory: [analysis],
    history: [analysis]
  };
}
