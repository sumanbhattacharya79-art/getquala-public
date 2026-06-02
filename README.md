# Quala — Free Retirement & Tax Calculator (Public Module)

Source for the two free, no-login calculators on [getquala.dev](https://getquala.dev):

| Calculator | Live URL |
|---|---|
| Retirement success (Monte Carlo) | https://getquala.dev/retirement-calculator |
| Federal + state + IRMAA tax | https://getquala.dev/tax-calculator |
| Hub | https://getquala.dev/calculators |

**Repository:** https://github.com/sumanbhattacharya79-art/getquala-public  
**License:** [MIT](LICENSE)

This code is extracted from the main Quala application so calculator and IRMAA logic can be reviewed, cited, and discussed. It is **not** a standalone runnable app (see [Partial extract](#partial-extract--not-runnable-as-is)).

---

## Why this exists

Many retirement planners freeze Medicare IRMAA income thresholds at a single year. Over 20+ years of projections, that understates future surcharges as brackets rise with inflation (CPI-U). Quala indexes IRMAA thresholds from published CMS values—for example, the single filer standard tier rose from about **$87,000** (2020) to about **$109,000** (2026).

This repo publishes the **free calculator UI slice** plus **client-side bracket / IRMAA helpers**. Full federal and state tax simulation runs server-side via [PolicyEngine US](https://github.com/PolicyEngine/policyengine-us).

**Full Quala app** (saved portfolios, lifecycle tax to age 100, Roth optimizer, etc.): https://getquala.dev — paid tier from $20/year.

---

## Try it (no clone required)

Use the live calculators above, or call the production API (same backend as getquala.dev):

```bash
# Retirement Monte Carlo snapshot
curl -s -X POST https://getquala.dev/api/quick-retirement-estimate \
  -H "Content-Type: application/json" \
  -d '{
    "current_age": 40,
    "years_to_retirement": 20,
    "portfolio_value_usd": 250000,
    "monthly_savings_usd": 2000,
    "monthly_spending_usd": 0,
    "household": "single"
  }'

# Tax snapshot (current year)
curl -s -X POST https://getquala.dev/api/quick-tax-estimate \
  -H "Content-Type: application/json" \
  -d '{
    "estimate_mode": "current_year",
    "age": 47,
    "years_until_retirement": 0,
    "filing_status": "single",
    "state_code": "CA",
    "employment_income": 120000
  }'

# Load a shared calculator link (inputs only; re-run estimate in the UI)
curl -s https://getquala.dev/api/quick-calculator-share/YOUR_SHARE_ID
```

---

## What's in here

```
getquala-public/
├── frontend/                         React (JSX) UI components
│   ├── QuickRetirementCalculator.jsx  Monte Carlo retirement success form + charts
│   ├── QuickTaxCalculator.jsx         Federal / state / IRMAA tax estimator form
│   ├── QuickCalcShareBar.jsx          Copy-link / native share bar
│   ├── quickCalculatorShare.js        Share URL helpers (parse, push, fetch)
│   ├── quickCalculatorFormUtils.js    Shared payload parsing (age, SS start age)
│   ├── freeCalculatorsLabel.js        Shared header badge copy
│   ├── calculatorSeo.js               Retirement calculator JSON-LD + FAQ
│   ├── taxCalculatorSeo.js              Tax calculator JSON-LD + FAQ
│   └── taxBracketMath.js              Client-side 2026 bracket / IRMAA math
└── backend/                          Python (FastAPI) service logic
    ├── quick_retirement_estimate.py   Growth + retirement Monte Carlo engine
    ├── quick_tax_estimate.py          PolicyEngine tax snapshot (5-year cap)
    ├── quick_calculator_share.py      Share link persistence (SQLite / Postgres)
    └── quick_calculator_config.py     Simulation limits and ticker constants
```

---

## Partial extract — not runnable as-is

These files are copied from the private Quala monorepo. To run end-to-end you need the full app (FastAPI `main.py`, market data, database, etc.).

**Backend modules in this repo still import (not included here):**

| Module | Used by |
|---|---|
| `tax_estimation.service` | `quick_tax_estimate.py` |
| `backtesting/` (Monte Carlo, types) | `quick_retirement_estimate.py` |
| `backend.saved_portfolio_backtest` | `quick_retirement_estimate.py` |
| `backend.db`, `backend.db_connection` | `quick_calculator_share.py` |

**Frontend files imported by the calculator components (not included here):**

`api.js`, `ChartContainer.jsx`, `LifePlannerDials.jsx`, `copyChartImage.js`, `legalFooter.jsx`, `useAppTheme.js`, `SeoHead.jsx`, `seoConfig.js`, `guideRegistry.js`

Server-side IRMAA lifecycle logic and PolicyEngine integration live in `tax_estimation/` in the main application. Only `taxBracketMath.js` (client-side helpers) is in this public repo.

---

## Retirement calculator

**Endpoint:** `POST /api/quick-retirement-estimate`

**What it does:**

1. Grows the user's current portfolio to retirement using a 100% VOO (US large-cap) proxy.
2. At the median terminal value (P50), runs a retirement stress-test using 30% NOBL / 40% SCHD / 30% VNQ.
3. Returns `retirement_success_percent` and `goal_funded_percent`.

**Key inputs:**

| Field | Description |
|---|---|
| `current_age` | Age of the user (18–90) |
| `years_to_retirement` | Years until planned retirement (1–50) |
| `portfolio_value_usd` | Current investable portfolio |
| `monthly_savings_usd` | Optional: monthly contributions until retirement |
| `monthly_spending_usd` | Optional: target monthly retirement spend (defaults to 4% rule) |
| `household` | `"single"` or `"married"` |
| `partner_age` | Partner's age (if married) |
| `partner_years_to_retirement` | Partner's years to retirement (if married) |

**Simulation constants**

| Constant | Value | Defined in |
|---|---|---|
| `QUICK_MC_SIMS` | 800 | `quick_calculator_config.py` |
| `WITHDRAWAL_RATE` | 4% | `quick_retirement_estimate.py` |
| `INFLATION_RATE_PCT` | 3.0% | `quick_retirement_estimate.py` |
| Growth tickers | VOO | `quick_calculator_config.py` |
| Retirement tickers | NOBL / SCHD / VNQ | `quick_calculator_config.py` |

**Limitations:** No Social Security, pension, or taxes in the retirement MC path. Uses bundled historical price data on the server; first run may be slower if data is cold.

---

## Tax estimator

**Endpoint:** `POST /api/quick-tax-estimate`

**What it does:**

- `estimate_mode: "current_year"` — federal + state + IRMAA for the current tax year.
- `estimate_mode: "after_retirement"` — first **5** retirement years, Taxable → Traditional IRA → Roth withdrawal order.

Powered by [PolicyEngine US](https://github.com/PolicyEngine/policyengine-us) (open-source, 50 states). Quala is not affiliated with PolicyEngine; we use their model under its license.

**Key inputs:**

| Field | Description |
|---|---|
| `estimate_mode` | `"current_year"` or `"after_retirement"` |
| `age` | Current age (18–100) |
| `years_until_retirement` | Only used in retirement mode |
| `filing_status` | `"single"`, `"joint"`, `"hoh"`, `"mfs"` |
| `state_code` | Two-letter US state (e.g. `"CA"`) |
| `employment_income` | W-2 income (current-year mode) |
| `annual_retirement_spending` | Annual cash need (retirement mode) |
| `taxable_brokerage_balance` | Taxable account balance |
| `traditional_ira_balance` | Traditional IRA / 401(k) balance |
| `roth_ira_balance` | Roth IRA balance |
| `social_security_monthly` | Monthly Social Security benefit |
| `social_security_start_age` | Age to start SS (62–70) |

**What the free tool does not include** (full Quala app):

- Withdrawal strategy optimizer
- Roth conversion optimizer
- Year-by-year projection to age 100
- State-by-state relocation comparison
- MAGI sensitivity / IRMAA bracket headroom charts

---

## IRMAA bracket math (client-side)

`taxBracketMath.js` implements:

- 2026 federal brackets (CPI-U indexed from anchor year 2026)
- IRMAA threshold detection (CPI-indexed from CMS tier values)
- Social Security provisional income (50% / 85% inclusion tiers)
- `magiSensitivityCurve()` — marginal federal tax at incremental MAGI

Related guide: [IRMAA brackets & Medicare premiums](https://getquala.dev/guides/irmaa-brackets-medicare-premiums)

### CMS / Medicare references (audit)

Use these official sources to verify income-related monthly adjustment amount (IRMAA) thresholds:

- [Medicare costs at a glance](https://www.medicare.gov/basics/costs/medicare-costs) (CMS)
- [IRMAA — Social Security](https://www.ssa.gov/medicare/irmaa) (how surcharges apply to Part B/D)
- Annual Medicare & You handbook and CMS fact sheets for tier dollar amounts by tax year

Quala anchors indexed thresholds to published tier values (e.g. 2020 ≈ $87k / 2026 ≈ $109k single standard tier) and projects forward with CPI-U unless you override assumptions in the full app.

---

## Share links

| Action | Endpoint / path |
|---|---|
| Create share (on estimate) | Returned as `share_id` / `share_url` in POST responses |
| Load share | `GET /api/quick-calculator-share/{share_id}` |
| Public URLs | `/retirement-calculator/s/<id>`, `/tax-calculator/s/<id>` |

Behavior:

- 12-character token (`secrets.token_urlsafe`)
- Payload stored in `quick_calculator_shares` (SQLite locally, Postgres in production)
- TTL: 365 days
- No PII — only form inputs needed to recreate the calculation

---

## Dependencies

**Backend (full app):**

- `fastapi` — routes registered in `main.py`
- `policyengine-us` — federal + 50-state tax simulation
- `pandas`, `numpy` — backtest / Monte Carlo engine

**Frontend (full app):**

- React 18
- D3 via `ChartContainer` for retirement fan charts (not in this repo)

Example pin (check your deployment): `policyengine-us>=1.700`

---

## Feedback and issues

Found a math discrepancy or unclear assumption?

1. Open an issue: https://github.com/sumanbhattacharya79-art/getquala-public/issues  
2. Include: inputs, expected vs actual, tax year, and filing status  
3. For production calculator bugs, you can also use the live tool’s share link so others can reproduce

---

## Disclaimer

Results are hypothetical simulations using historical or estimated data. This is not personalized investment, tax, or legal advice. Verify all figures with a qualified professional before making financial decisions.
