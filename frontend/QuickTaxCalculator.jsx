import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson } from "./api";
import { QuickCalcShareBar } from "./QuickCalcShareBar.jsx";
import {
  fetchQuickCalculatorShare,
  parseShareIdFromPath,
  pushSharePathForKind,
} from "./quickCalculatorShare.js";
import { LegalStickyFooter } from "./legalFooter.jsx";
import { useSyncedAppTheme } from "./useAppTheme.js";
import { SeoHead } from "./SeoHead.jsx";
import { ROUTE_SEO } from "./seoConfig.js";
import { TAX_CALCULATOR_FAQ, taxCalculatorJsonLd, taxMinimizeSignupUrl } from "./taxCalculatorSeo.js";
import { FREE_CALCULATORS_HEADER_LABEL } from "./freeCalculatorsLabel.js";
import { fmtEffectiveTaxPct } from "./taxBracketMath.js";
import {
  isTaxEstimatePayload,
  parseAgeInput,
  parseSsStartAgeInput,
  resolvePayloadAge,
} from "./quickCalculatorFormUtils.js";

const TAX_PATH = "/tax-calculator";
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function parseMoney(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "").replace(/\$/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readQueryDefaults() {
  if (typeof window === "undefined") {
    return { mode: "current_year", age: "47", years: "10" };
  }
  const q = new URLSearchParams(window.location.search);
  const mode = q.get("mode") === "retirement" ? "after_retirement" : "current_year";
  return {
    mode,
    age: q.get("age") || "47",
    years: q.get("years") || "10",
  };
}

function applyTaxPayloadToForm(payload, setters) {
  const p = payload || {};
  if (p.estimate_mode === "after_retirement" || p.estimate_mode === "current_year") {
    setters.setEstimateMode(p.estimate_mode);
  }
  if (p.age != null) setters.setAge(String(p.age));
  else if (p.current_age != null) setters.setAge(String(p.current_age));
  if (p.years_until_retirement != null) setters.setYearsUntilRetirement(String(p.years_until_retirement));
  if (p.filing_status) setters.setFilingStatus(String(p.filing_status));
  if (p.state_code) setters.setStateCode(String(p.state_code).toUpperCase().slice(0, 2));
  if (p.employment_income != null && Number(p.employment_income) > 0) {
    setters.setEmploymentIncome(String(Math.round(Number(p.employment_income))));
  }
  if (p.annual_retirement_spending != null && Number(p.annual_retirement_spending) > 0) {
    setters.setAnnualSpending(String(Math.round(Number(p.annual_retirement_spending))));
  }
  if (p.taxable_brokerage_balance != null) {
    setters.setTaxableBalance(String(Math.round(Number(p.taxable_brokerage_balance))));
  }
  if (p.traditional_ira_balance != null) {
    setters.setIraBalance(String(Math.round(Number(p.traditional_ira_balance))));
  }
  if (p.roth_ira_balance != null) {
    setters.setRothBalance(String(Math.round(Number(p.roth_ira_balance))));
  }
  if (p.social_security_monthly != null) {
    setters.setSsMonthly(String(Math.round(Number(p.social_security_monthly))));
  }
  if (p.social_security_start_age != null) {
    setters.setSsStartAge(String(p.social_security_start_age));
  }
}

function buildTaxEstimateBodyFromPayload(payload) {
  const p = payload || {};
  const mode = p.estimate_mode === "after_retirement" ? "after_retirement" : "current_year";
  const ageN = resolvePayloadAge(p);
  const ssStart = parseSsStartAgeInput(p.social_security_start_age, 62);
  return {
    estimate_mode: mode,
    age: ageN,
    years_until_retirement: mode === "after_retirement" ? Math.round(Number(p.years_until_retirement ?? 0)) : 0,
    filing_status: p.filing_status || "single",
    state_code: String(p.state_code || "CA").toUpperCase().slice(0, 2),
    employment_income: Number(p.employment_income) || 0,
    annual_retirement_spending: mode === "after_retirement" ? Number(p.annual_retirement_spending) || 0 : 0,
    taxable_brokerage_balance: Number(p.taxable_brokerage_balance) || 0,
    traditional_ira_balance: Number(p.traditional_ira_balance) || 0,
    roth_ira_balance: Number(p.roth_ira_balance) || 0,
    social_security_monthly: Number(p.social_security_monthly) || 0,
    social_security_start_age: ssStart ?? 62,
  };
}

export function QuickTaxCalculator() {
  useSyncedAppTheme();
  const defaults = useMemo(() => readQueryDefaults(), []);
  const [estimateMode, setEstimateMode] = useState(defaults.mode);
  const [age, setAge] = useState(defaults.age);
  const [yearsUntilRetirement, setYearsUntilRetirement] = useState(defaults.years);
  const [filingStatus, setFilingStatus] = useState("single");
  const [stateCode, setStateCode] = useState("CA");
  const [employmentIncome, setEmploymentIncome] = useState("");
  const [annualSpending, setAnnualSpending] = useState("80000");
  const [taxableBalance, setTaxableBalance] = useState("500000");
  const [iraBalance, setIraBalance] = useState("800000");
  const [rothBalance, setRothBalance] = useState("100000");
  const [ssMonthly, setSsMonthly] = useState("2000");
  const [ssStartAge, setSsStartAge] = useState("62");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [shareUrl, setShareUrl] = useState("");

  const isRetirementMode = estimateMode === "after_retirement";
  const taxSeo = ROUTE_SEO.taxCalculator;
  const minimizeHref = taxMinimizeSignupUrl();

  const runEstimate = useCallback(async (payloadOverride = null) => {
    setError("");
    const sharePayload = isTaxEstimatePayload(payloadOverride) ? payloadOverride : null;
    const ageResolved =
      resolvePayloadAge(sharePayload) ?? parseAgeInput(age);
    const ssStartResolved = sharePayload
      ? parseSsStartAgeInput(sharePayload.social_security_start_age, 62)
      : parseSsStartAgeInput(ssStartAge, 62);
    if (ageResolved == null) {
      setError("Enter your current age (18–100).");
      return;
    }
    if (ssStartResolved == null) {
      setError("Social Security start age must be between 62 and 70.");
      return;
    }
    const body = sharePayload
      ? { ...buildTaxEstimateBodyFromPayload(sharePayload), age: ageResolved, social_security_start_age: ssStartResolved }
      : {
          estimate_mode: estimateMode,
          age: ageResolved,
          years_until_retirement: estimateMode === "after_retirement" ? Math.round(Number(yearsUntilRetirement)) : 0,
          filing_status: filingStatus,
          state_code: stateCode,
          employment_income: parseMoney(employmentIncome),
          annual_retirement_spending: estimateMode === "after_retirement" ? parseMoney(annualSpending) : 0,
          taxable_brokerage_balance: parseMoney(taxableBalance),
          traditional_ira_balance: parseMoney(iraBalance),
          roth_ira_balance: parseMoney(rothBalance),
          social_security_monthly: parseMoney(ssMonthly),
          social_security_start_age: ssStartResolved,
        };
    const yearsN = Number(body.years_until_retirement);
    const retirementMode = body.estimate_mode === "after_retirement";
    if (retirementMode) {
      if (!Number.isFinite(yearsN) || yearsN < 0 || yearsN > 50) {
        setError("Enter years until retirement (0–50).");
        return;
      }
      if (Number(body.annual_retirement_spending) <= 0) {
        setError("Enter annual retirement spending.");
        return;
      }
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await postJson("/api/quick-tax-estimate", body);
      setResult(data);
      const url = data.share_url || "";
      setShareUrl(url);
      if (data.share_id) pushSharePathForKind("tax", data.share_id);
    } catch (e) {
      setError(e?.message || "Estimate failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    age,
    annualSpending,
    employmentIncome,
    estimateMode,
    filingStatus,
    iraBalance,
    isRetirementMode,
    rothBalance,
    ssMonthly,
    ssStartAge,
    stateCode,
    taxableBalance,
    yearsUntilRetirement,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shareId = parseShareIdFromPath(window.location.pathname, "tax");
    if (!shareId) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchQuickCalculatorShare(shareId);
        if (cancelled) return;
        if (row.kind !== "tax") {
          setError("This link is for the retirement calculator. Open it from the retirement results page.");
          return;
        }
        applyTaxPayloadToForm(row.payload, {
          setEstimateMode,
          setAge,
          setYearsUntilRetirement,
          setFilingStatus,
          setStateCode,
          setEmploymentIncome,
          setAnnualSpending,
          setTaxableBalance,
          setIraBalance,
          setRothBalance,
          setSsMonthly,
          setSsStartAge,
        });
        if (row.share_url) setShareUrl(row.share_url);
        await runEstimate(row.payload);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Could not load shared calculator.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load shared link once
  }, []);

  const b = result?.breakdown || {};
  const irmaa = result?.irmaa;
  const lifeSummary = result?.lifecycle_summary;
  const lifecycleRows = result?.lifecycle_projection || [];

  return (
    <div className="quick-calc-page quick-tax-calc-page">
      <SeoHead
        title={taxSeo.title}
        description={taxSeo.description}
        path={taxSeo.path}
        robots={taxSeo.robots}
        jsonLd={taxCalculatorJsonLd()}
      />
      <header className="quick-calc-topbar quick-calc-topbar--contrast">
        <div className="quick-calc-topbar-left">
          <a href="/calculators" className="quick-calc-brand">
            <span className="quick-calc-brand-title">Quala AI</span>
          </a>
          <span className="quick-calc-header-badge">{FREE_CALCULATORS_HEADER_LABEL}</span>
        </div>
        <div className="quick-calc-topbar-right">
          <a href="/calculators" className="quick-calc-nav-link quick-calc-nav-link--on-contrast">
            All calculators
          </a>
          <a href="/" className="quick-calc-nav-link quick-calc-nav-link--on-contrast">
            Full app
          </a>
        </div>
      </header>

      <main className="quick-calc-main">
        <section className="quick-calc-hero">
          <h1>How much tax might you owe?</h1>
          <p className="quick-calc-lead">
            A free snapshot of federal and state tax plus Medicare IRMAA surcharges. Estimate{" "}
            <strong>this year</strong> or the <strong>first five years after retirement</strong> using a
            standard taxable → IRA → Roth draw order — no login required.
          </p>
        </section>

        <section className="quick-calc-card tax-calc-mode-card">
          <div className="tax-est-mode-switch" role="tablist" aria-label="Tax estimate mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isRetirementMode}
              className={`tax-est-mode-switch__btn${!isRetirementMode ? " tax-est-mode-switch__btn--active" : ""}`}
              onClick={() => {
                setEstimateMode("current_year");
                setResult(null);
              }}
            >
              Current year
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRetirementMode}
              className={`tax-est-mode-switch__btn${isRetirementMode ? " tax-est-mode-switch__btn--active" : ""}`}
              onClick={() => {
                setEstimateMode("after_retirement");
                setResult(null);
              }}
            >
              First 5 retirement years
            </button>
          </div>
          <p className="tax-est-mode-hint">
            {isRetirementMode
              ? "Projects five years starting at retirement (Taxable → IRA → Roth). No strategy optimizer or state comparison in this free tool."
              : "Single-year estimate for your current age and income."}
          </p>

          <div
            className={`tax-est-form-grid${isRetirementMode ? "" : " tax-est-form-grid--pair"}`}
            style={{ marginTop: 16 }}
          >
            <label className="tax-est-field">
              <span className="tax-est-field__label">Current age</span>
              <input
                type="number"
                min={18}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={loading}
              />
            </label>
            {isRetirementMode ? (
              <label className="tax-est-field">
                <span className="tax-est-field__label">Years until retirement</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={yearsUntilRetirement}
                  onChange={(e) => setYearsUntilRetirement(e.target.value)}
                  disabled={loading}
                />
              </label>
            ) : null}
            <label className="tax-est-field">
              <span className="tax-est-field__label">Filing status</span>
              <select
                value={filingStatus}
                onChange={(e) => setFilingStatus(e.target.value)}
                disabled={loading}
              >
                <option value="single">Single</option>
                <option value="joint">Married filing jointly</option>
                <option value="hoh">Head of household</option>
                <option value="mfs">Married filing separately</option>
              </select>
            </label>
            <label className="tax-est-field">
              <span className="tax-est-field__label">State</span>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                disabled={loading}
              >
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {!isRetirementMode ? (
              <label className="tax-est-field tax-est-form-grid__full">
                <span className="tax-est-field__label">W-2 / employment income (this year)</span>
                <input
                  value={employmentIncome}
                  onChange={(e) => setEmploymentIncome(e.target.value)}
                  placeholder="120000"
                  disabled={loading}
                />
              </label>
            ) : null}
            {isRetirementMode ? (
              <>
                <label className="tax-est-field tax-est-form-grid__full">
                  <span className="tax-est-field__label">Annual retirement spending (cash need)</span>
                  <input
                    value={annualSpending}
                    onChange={(e) => setAnnualSpending(e.target.value)}
                    placeholder="80000"
                    disabled={loading}
                  />
                </label>
                <label className="tax-est-field">
                  <span className="tax-est-field__label">Taxable brokerage balance</span>
                  <input
                    value={taxableBalance}
                    onChange={(e) => setTaxableBalance(e.target.value)}
                    placeholder="500000"
                    disabled={loading}
                  />
                </label>
                <label className="tax-est-field">
                  <span className="tax-est-field__label">Traditional IRA / 401(k)</span>
                  <input
                    value={iraBalance}
                    onChange={(e) => setIraBalance(e.target.value)}
                    placeholder="800000"
                    disabled={loading}
                  />
                </label>
                <label className="tax-est-field">
                  <span className="tax-est-field__label">Roth IRA (optional)</span>
                  <input
                    value={rothBalance}
                    onChange={(e) => setRothBalance(e.target.value)}
                    placeholder="100000"
                    disabled={loading}
                  />
                </label>
                <label className="tax-est-field">
                  <span className="tax-est-field__label">Social Security (monthly)</span>
                  <input
                    value={ssMonthly}
                    onChange={(e) => setSsMonthly(e.target.value)}
                    placeholder="2000"
                    disabled={loading}
                  />
                </label>
                <label className="tax-est-field">
                  <span className="tax-est-field__label">SS start age</span>
                  <input
                    type="number"
                    min={62}
                    max={70}
                    value={ssStartAge}
                    onChange={(e) => setSsStartAge(e.target.value)}
                    disabled={loading}
                  />
                </label>
              </>
            ) : null}
          </div>
          {error ? <p className="quick-calc-error">{error}</p> : null}
          <button type="button" className="quick-calc-submit" onClick={() => runEstimate()} disabled={loading}>
            {loading ? "Estimating taxes…" : "Estimate taxes"}
          </button>
          {loading ? (
            <p className="quick-calc-hint">Estimating taxes.</p>
          ) : null}
        </section>

        {result ? (
          <>
            <QuickCalcShareBar
              shareUrl={shareUrl}
              shareTitle="Quala tax calculator"
              shareText={
                result.effective_tax_rate != null
                  ? `Estimated effective tax rate: ${fmtEffectiveTaxPct(result.effective_tax_rate)} — Quala`
                  : "Tax snapshot — Quala"
              }
            />
            <section className="quick-calc-results">
              <h2>Your tax snapshot</h2>
              {result.summary_label ? (
                <p className="quick-calc-stat-line">{result.summary_label}</p>
              ) : null}
              <div className="quick-tax-metrics">
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">Total tax burden</span>
                  <span className="quick-tax-metric__value">
                    {fmtUsd(result.total_with_irmaa_and_penalties)}
                  </span>
                </div>
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">Effective rate</span>
                  <span className="quick-tax-metric__value">
                    {fmtEffectiveTaxPct(result.effective_tax_rate)}
                  </span>
                </div>
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">MAGI (proxy)</span>
                  <span className="quick-tax-metric__value">{fmtUsd(result.magi)}</span>
                </div>
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">Federal</span>
                  <span className="quick-tax-metric__value">{fmtUsd(result.federal_income_tax)}</span>
                </div>
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">State</span>
                  <span className="quick-tax-metric__value">{fmtUsd(result.state_income_tax)}</span>
                </div>
                <div className="quick-tax-metric">
                  <span className="quick-tax-metric__label">IRMAA (annual)</span>
                  <span className="quick-tax-metric__value">
                    {fmtUsd(irmaa?.total_annual_surcharge)}
                  </span>
                </div>
              </div>
            </section>

            {isRetirementMode && lifeSummary ? (
              <section className="quick-calc-card">
                <h3 style={{ marginTop: 0 }}>Five-year summary</h3>
                <p className="quick-calc-stat-line">
                  Lifetime gross tax: <strong>{fmtUsd(lifeSummary.lifetime_gross_taxes)}</strong>
                  {lifeSummary.lifetime_effective_tax_rate != null ? (
                    <>
                      {" "}
                      · Lifetime effective rate:{" "}
                      <strong>{fmtEffectiveTaxPct(lifeSummary.lifetime_effective_tax_rate)}</strong>
                    </>
                  ) : null}
                </p>
              </section>
            ) : null}

            {isRetirementMode && lifecycleRows.length ? (
              <section className="quick-calc-card">
                <h3 style={{ marginTop: 0 }}>Year-by-year (first 5 retirement years)</h3>
                <div className="quick-tax-table-wrap">
                  <table className="quick-tax-table">
                    <thead>
                      <tr>
                        <th>Age</th>
                        <th>Tax yr</th>
                        <th>Gross tax</th>
                        <th>Eff. rate</th>
                        <th>MAGI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lifecycleRows.map((row) => (
                        <tr key={`${row.age}-${row.tax_year}`}>
                          <td>{row.age}</td>
                          <td>{row.tax_year}</td>
                          <td>{fmtUsd(row.total_gross_tax)}</td>
                          <td>{fmtEffectiveTaxPct(row.effective_tax_rate)}</td>
                          <td>{fmtUsd(row.magi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="quick-calc-card">
              <h3 style={{ marginTop: 0 }}>Breakdown</h3>
              <table className="quick-tax-table">
                <tbody>
                  <tr>
                    <td>Federal income tax</td>
                    <td>{fmtUsd(b.federal_income_tax)}</td>
                  </tr>
                  <tr>
                    <td>State income tax</td>
                    <td>{fmtUsd(b.state_income_tax)}</td>
                  </tr>
                  <tr>
                    <td>Net investment income tax</td>
                    <td>{fmtUsd(b.net_investment_income_tax)}</td>
                  </tr>
                  <tr>
                    <td>Medicare IRMAA surcharge</td>
                    <td>{fmtUsd(b.irmaa_annual)}</td>
                  </tr>
                  <tr>
                    <td>Early withdrawal penalty</td>
                    <td>{fmtUsd(b.early_withdrawal_penalty)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {Array.isArray(result.warnings) && result.warnings.length ? (
              <section className="quick-calc-card">
                <h3 style={{ marginTop: 0 }}>Notes</h3>
                <ul className="quick-tax-warnings">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="quick-calc-nudge quick-calc-nudge--tax">
              <h3>Want to minimize lifetime taxes?</h3>
              <p>
                The full Quala tax planner adds withdrawal strategy search, Roth conversion optimization,
                IRMAA-aware planning, state-by-state comparison, and projections through age 100 — tied
                to your saved portfolios and intake.
              </p>
              <a href={minimizeHref} className="quick-calc-cta">
                Create account / log in for tax optimization
              </a>
            </section>
          </>
        ) : null}

        <section className="quick-calc-faq" aria-labelledby="tax-calc-faq-heading">
          <h2 id="tax-calc-faq-heading">Frequently asked questions</h2>
          <dl className="quick-calc-faq-list">
            {TAX_CALCULATOR_FAQ.map((item) => (
              <div key={item.question} className="quick-calc-faq-item">
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <nav className="quick-calc-guides" aria-label="Related tools">
          <h2>Related</h2>
          <ul>
            <li>
              <a href="/calculators">All free calculators</a>
            </li>
            <li>
              <a href="/retirement-calculator">Retirement success calculator</a>
            </li>
            <li>
              <a href="/guides/irmaa-brackets-medicare-premiums">IRMAA & Medicare guide</a>
            </li>
            <li>
              <a href="/guides/roth-conversion-tax-bracket">Roth conversion guide</a>
            </li>
          </ul>
        </nav>
      </main>
      <LegalStickyFooter />
    </div>
  );
}
