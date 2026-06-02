"""Shared limits for public free calculators (retirement MC + tax)."""

# Fewer paths than full app (5000) — stable enough for P50 / success % in ~1–3s per phase.
QUICK_MC_SIMS = 800

# Growth backtest: single scenario (no monthly / adaptive rebalancing).
QUICK_GROWTH_SCENARIOS = ("none",)

# Retirement teaser charts: fewer spaghetti paths in API payload.
QUICK_RETIREMENT_MAX_PATHS = 50

# Bundled CSVs should meet this (~20y monthly); see scripts/refresh_calculator_market_data.py.
CALCULATOR_MIN_MONTHLY_ROWS = 240
CALCULATOR_GROWTH_TICKERS = ("VOO",)
CALCULATOR_RETIREMENT_TICKERS = ("NOBL", "SCHD", "VNQ")
# Last-resort proxy if a calculator file is still short (avoid live fetch in API).
CALCULATOR_PRICE_PROXY = {"VOO": "SPY", "NOBL": "SPY", "SCHD": "SPY"}

# Target wall-clock budget for API handlers (inform UI copy).
QUICK_CALC_TARGET_SECONDS = 10
