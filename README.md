# Quala — Free Retirement & Tax Calculator (Public Module)

This directory contains the source code for the two free, no-login calculators live at [getquala.dev](https://getquala.dev):

- **Retirement success calculator** — `/retirement-calculator`
- **Federal + state + IRMAA tax estimator** — `/tax-calculator`

Both run without an account. This code is extracted from the main Quala application to make the calculator logic reviewable and embeddable.

---

## What's in here

```
quala-public/
├── frontend/                         React (JSX) UI components
│   ├── QuickRetirementCalculator.jsx  Monte Carlo retirement success form + charts
│   ├── QuickTaxCalculator.jsx         Federal / state / IRMAA tax estimator form
│   ├── QuickCalcShareBar.jsx          Copy-link / native share bar
│   ├── quickCalculatorShare.js        Share URL helpers (parse, push, fetch)
│   ├── quickCalculatorFormUtils.js    Shared payload parsing (age, SS start age)
│   ├── freeCalculatorsLabel.js        Shared header badge copy
│   ├── calculatorSeo.js               Retirement calculator JSON-LD + FAQ
│   ├── taxCalculatorSeo.js            Tax calculator JSON-LD + FAQ
│   └── taxBracketMath.js              Client-side 2026 bracket / IRMAA math
└── backend/                          Python (FastAPI) service logic
    ├── quick_retirement_estimate.py   Growth + retirement Monte Carlo engine
    ├── quick_tax_estimate.py          PolicyEngine tax snapshot (5-year cap)
    ├── quick_calculator_share.py      Share link persistence (SQLite / Postgres)
    └── quick_calculator_config.py     Simulation limits and ticker constants
```

---

## Retirement calculator

**Endpoint:** `POST /api/quick-retirement-estimate`

**What it does:**
1. Grows the user's current portfolio to retirement using a 100% VOO (US large-cap) proxy.
2. At the median terminal value (P50), starts a retirement stress-test using 30% NOBL / 40% SCHD / 30% VNQ.
3. Returns `retirement_success_percent` (probability of not running out of money) and `goal_funded_percent` (current portfolio ÷ projected median at retirement).

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

**Simulation configuration** (`quick_calculator_config.py`):

| Constant | Value | Notes |
|---|---|---|
| `QUICK_MC_SIMS` | 800 | Monte Carlo paths per phase |
| `WITHDRAWAL_RATE` | 4% | Applied when no monthly spending is provided |
| `INFLATION_RATE_PCT` | 3.0% | Applied to spending in retirement stress-test |
| Growth tickers | VOO | US large-cap proxy |
| Retirement tickers | NOBL / SCHD / VNQ | Dividend equity + REIT |

---

## Tax estimator

**Endpoint:** `POST /api/quick-tax-estimate`

**What it does:**
- `estimate_mode: "current_year"` — federal + state + IRMAA snapshot for the current tax year at the given W-2 / income.
- `estimate_mode: "after_retirement"` — projects the first 5 retirement years using a standard Taxable → Traditional IRA → Roth withdrawal sequence.

Powered by [PolicyEngine US](https://github.com/PolicyEngine/policyengine-us) (open-source, 50-state).

**Key inputs:**

| Field | Description |
|---|---|
| `estimate_mode` | `"current_year"` or `"after_retirement"` |
| `age` | Current age (18–100) |
| `years_until_retirement` | Only used in retirement mode |
| `filing_status` | `"single"`, `"joint"`, `"hoh"`, `"mfs"` |
| `state_code` | Two-letter US state (e.g. `"CA"`) |
| `employment_income` | W-2 income (current-year mode) |
| `annual_retirement_spending` | Annual cash need in retirement (retirement mode) |
| `taxable_brokerage_balance` | Taxable account balance |
| `traditional_ira_balance` | Traditional IRA / 401(k) balance |
| `roth_ira_balance` | Roth IRA balance |
| `social_security_monthly` | Monthly Social Security benefit |
| `social_security_start_age` | Age to start SS (62–70) |

**What the free tool does NOT include** (available in the full Quala app):
- Withdrawal strategy optimizer (Roth-first, LTCG-optimized, custom)
- Roth conversion optimizer
- Year-by-year projection to age 100
- State-by-state relocation comparison
- MAGI sensitivity / IRMAA bracket headroom charts

---

## IRMAA bracket math (client-side)

`taxBracketMath.js` implements:
- 2026 federal brackets (CPI-U indexed from anchor year)
- IRMAA threshold detection (CPI-indexed from actual CMS publications: 2020 $87K → 2026 $109K)
- Social Security provisional income calculation (50% / 85% inclusion tiers)
- `magiSensitivityCurve()` — marginal tax rate at incremental MAGI values

This is the same logic surfaced in the [Quala IRMAA guide](https://getquala.dev/guides/irmaa-brackets-medicare-premiums). The server-side equivalent lives in `tax_estimation/bracket_utils.py` (not included in this public module — part of the main PolicyEngine integration).

---

## Share links

Both calculators support persistent share URLs (`/retirement-calculator/s/<id>`, `/tax-calculator/s/<id>`). The share system:
- Generates a 12-char token (`secrets.token_urlsafe`)
- Stores the input payload in `quick_calculator_shares` (SQLite locally, Postgres in production)
- TTL: 365 days
- No PII is stored — only the form inputs needed to recreate the calculation

---

## Dependencies

**Backend:**
- `fastapi` — HTTP routing (routes registered in `main.py`)
- `policyengine-us` — federal + 50-state tax simulation
- `pandas`, `numpy` — backtest engine (in `backtesting/`)

**Frontend:**
- React 18 (hooks only, no class components)
- No charting library in this module — `ChartContainer` (used by the retirement calculator) is in the main app

---

## Disclaimer

Results are hypothetical simulations using historical or estimated data. This is not personalized investment, tax, or legal advice. Verify all figures with a qualified professional before making financial decisions.
