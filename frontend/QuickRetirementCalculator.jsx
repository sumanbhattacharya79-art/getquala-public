import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postJson } from "./api";
import { ChartContainer } from "./ChartContainer.jsx";
import { copyElementToClipboard } from "./copyChartImage.js";
import { QuickCalcShareBar } from "./QuickCalcShareBar.jsx";
import { FREE_CALCULATORS_HEADER_LABEL } from "./freeCalculatorsLabel.js";
import {
  fetchQuickCalculatorShare,
  parseShareIdFromPath,
  pushSharePathForKind,
} from "./quickCalculatorShare.js";
import { LifePlannerDials } from "./LifePlannerDials.jsx";
import { LegalStickyFooter } from "./legalFooter.jsx";
import { useSyncedAppTheme } from "./useAppTheme.js";
import { SeoHead } from "./SeoHead.jsx";
import { ROUTE_SEO, organicSignupUrl } from "./seoConfig.js";
import { CALCULATOR_FAQ, calculatorJsonLd } from "./calculatorSeo.js";
import { listGuideSlugs, getGuideMeta } from "./guideRegistry.js";

const CALC_PATH = "/retirement-calculator";

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function parseMoneyInput(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "").replace(/\$/g, "");
  if (!s) return 0;
  const m = s.match(/^([\d.]+)\s*([kKmMbB])?$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return 0;
  const u = (m[2] || "").toUpperCase();
  if (u === "K") n *= 1e3;
  else if (u === "M") n *= 1e6;
  else if (u === "B") n *= 1e9;
  return n;
}

function parsePortfolioInput(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([kKmMbB])?$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = (m[2] || "").toUpperCase();
  if (u === "K") n *= 1e3;
  else if (u === "M") n *= 1e6;
  else if (u === "B") n *= 1e9;
  return n;
}

function readQueryDefaults() {
  if (typeof window === "undefined") {
    return {
      age: "40",
      years: "20",
      portfolio: "250000",
      monthlySavings: "",
      monthlySpending: "",
      household: "single",
      partnerAge: "",
      partnerYears: "",
    };
  }
  const q = new URLSearchParams(window.location.search);
  const h = q.get("household");
  return {
    age: q.get("age") || "40",
    years: q.get("years") || "20",
    portfolio: q.get("portfolio") || "250000",
    monthlySavings: q.get("savings") || "",
    monthlySpending: q.get("spending") || "",
    household: h === "married" || h === "couple" ? "married" : "single",
    partnerAge: q.get("partner_age") || "",
    partnerYears: q.get("partner_years") || "",
  };
}

function buildEstimateBody(overrides, form) {
  const currentAge = Math.round(Number(overrides?.current_age ?? form.age));
  const yearsToRetirement = Math.round(Number(overrides?.years_to_retirement ?? form.years));
  const portfolioUsd =
    overrides?.portfolio_value_usd != null
      ? Number(overrides.portfolio_value_usd)
      : parsePortfolioInput(form.portfolio);
  const monthlySavings =
    overrides?.monthly_savings_usd != null
      ? Number(overrides.monthly_savings_usd)
      : parseMoneyInput(form.monthlySavings);
  const monthlySpending =
    overrides?.monthly_spending_usd != null
      ? Number(overrides.monthly_spending_usd)
      : parseMoneyInput(form.monthlySpending);
  const household =
    overrides?.household === "married" || overrides?.household === "single"
      ? overrides.household
      : form.household === "married"
        ? "married"
        : "single";
  const body = {
    current_age: currentAge,
    years_to_retirement: yearsToRetirement,
    portfolio_value_usd: portfolioUsd,
    monthly_savings_usd: monthlySavings,
    monthly_spending_usd: monthlySpending,
    household,
  };
  if (household === "married") {
    const partnerAge = Math.round(
      Number(overrides?.partner_age ?? form.partnerAge),
    );
    const partnerYears = Math.round(
      Number(overrides?.partner_years_to_retirement ?? form.partnerYears),
    );
    body.partner_age = partnerAge;
    body.partner_years_to_retirement = partnerYears;
  }
  return body;
}

function legacyQueryShareUrl(body) {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}${CALC_PATH}`
      : `https://getquala.dev${CALC_PATH}`;
  const q = new URLSearchParams({
    age: String(body.current_age),
    years: String(body.years_to_retirement),
    portfolio: String(Math.round(body.portfolio_value_usd)),
    household: body.household,
  });
  if (body.monthly_savings_usd > 0) q.set("savings", String(Math.round(body.monthly_savings_usd)));
  if (body.monthly_spending_usd > 0) q.set("spending", String(Math.round(body.monthly_spending_usd)));
  if (body.household === "married" && body.partner_age != null) {
    q.set("partner_age", String(body.partner_age));
    q.set("partner_years", String(body.partner_years_to_retirement));
  }
  return `${base}?${q.toString()}`;
}

function applyRetirementPayloadToForm(payload, setters) {
  const p = payload || {};
  if (p.current_age != null) setters.setAge(String(p.current_age));
  if (p.years_to_retirement != null) setters.setYears(String(p.years_to_retirement));
  if (p.portfolio_value_usd != null) setters.setPortfolio(String(Math.round(Number(p.portfolio_value_usd))));
  if (p.monthly_savings_usd != null && Number(p.monthly_savings_usd) > 0) {
    setters.setMonthlySavings(String(Math.round(Number(p.monthly_savings_usd))));
  }
  if (p.monthly_spending_usd != null && Number(p.monthly_spending_usd) > 0) {
    setters.setMonthlySpending(String(Math.round(Number(p.monthly_spending_usd))));
  }
  if (p.household === "married" || p.household === "single") {
    setters.setHousehold(p.household);
  }
  if (p.partner_age != null) setters.setPartnerAge(String(p.partner_age));
  if (p.partner_years_to_retirement != null) {
    setters.setPartnerYears(String(p.partner_years_to_retirement));
  }
}

function householdLabel(household) {
  return household === "married" ? "We (married)" : "I (single)";
}

export function QuickRetirementCalculator() {
  const defaults = useMemo(() => readQueryDefaults(), []);
  const theme = useSyncedAppTheme();
  const [age, setAge] = useState(defaults.age);
  const [years, setYears] = useState(defaults.years);
  const [portfolio, setPortfolio] = useState(defaults.portfolio);
  const [monthlySavings, setMonthlySavings] = useState(defaults.monthlySavings);
  const [monthlySpending, setMonthlySpending] = useState(defaults.monthlySpending);
  const [household, setHousehold] = useState(defaults.household);
  const [partnerAge, setPartnerAge] = useState(defaults.partnerAge);
  const [partnerYears, setPartnerYears] = useState(defaults.partnerYears);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [shareStatus, setShareStatus] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copyImageBusy, setCopyImageBusy] = useState(false);
  const outputCaptureRef = useRef(null);

  const runEstimate = useCallback(async (overrides = null) => {
    setError("");
    const body = buildEstimateBody(overrides, {
      age,
      years,
      portfolio,
      monthlySavings,
      monthlySpending,
      household,
      partnerAge,
      partnerYears,
    });
    if (!Number.isFinite(body.current_age) || body.current_age < 18 || body.current_age > 90) {
      setError("Enter your age (18–90).");
      return;
    }
    if (!Number.isFinite(body.years_to_retirement) || body.years_to_retirement < 1 || body.years_to_retirement > 50) {
      setError("Enter years until retirement (1–50).");
      return;
    }
    if (body.household === "married") {
      if (!Number.isFinite(body.partner_age) || body.partner_age < 18 || body.partner_age > 90) {
        setError("Enter partner's age (18–90).");
        return;
      }
      if (
        !Number.isFinite(body.partner_years_to_retirement) ||
        body.partner_years_to_retirement < 1 ||
        body.partner_years_to_retirement > 50
      ) {
        setError("Enter partner years until retirement (1–50).");
        return;
      }
    }
    if (body.portfolio_value_usd == null || body.portfolio_value_usd <= 0) {
      setError("Enter a valid portfolio value (e.g. 250000 or 500K).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await postJson("/api/quick-retirement-estimate", body);
      setResult(data);
      const url = data.share_url || legacyQueryShareUrl(body);
      setShareUrl(url);
      if (data.share_id) pushSharePathForKind("retirement", data.share_id);
      else {
        try {
          window.history.replaceState(null, "", legacyQueryShareUrl(body));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e?.message || "Estimate failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [age, years, portfolio, monthlySavings, monthlySpending, household, partnerAge, partnerYears]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shareId = parseShareIdFromPath(window.location.pathname, "retirement");
    if (shareId) {
      let cancelled = false;
      (async () => {
        try {
          const row = await fetchQuickCalculatorShare(shareId);
          if (cancelled || row.kind !== "retirement") return;
          applyRetirementPayloadToForm(row.payload, {
            setAge,
            setYears,
            setPortfolio,
            setMonthlySavings,
            setMonthlySpending,
            setHousehold,
            setPartnerAge,
            setPartnerYears,
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
    }
    const q = new URLSearchParams(window.location.search);
    if (!q.get("age") || !q.get("years") || !q.get("portfolio")) return;
    runEstimate({
      current_age: Number(q.get("age")),
      years_to_retirement: Number(q.get("years")),
      portfolio_value_usd: Number(q.get("portfolio")),
      monthly_savings_usd: q.get("savings") ? Number(q.get("savings")) : 0,
      monthly_spending_usd: q.get("spending") ? Number(q.get("spending")) : 0,
      household: q.get("household") === "married" ? "married" : "single",
      partner_age: q.get("partner_age") ? Number(q.get("partner_age")) : undefined,
      partner_years_to_retirement: q.get("partner_years") ? Number(q.get("partner_years")) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opening a shared link
  }, []);

  const onCopyImage = useCallback(async () => {
    if (!result || !outputCaptureRef.current || copyImageBusy) return;
    setShareStatus("");
    setCopyImageBusy(true);
    try {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const copyResult = await copyElementToClipboard(outputCaptureRef.current, {
        filename: "quala-retirement-calculator.png",
      });
      setShareStatus(
        copyResult.method === "clipboard"
          ? "Image copied — paste anywhere"
          : "Image saved — paste from your downloads",
      );
    } catch (err) {
      console.warn("Copy calculator snapshot failed:", err);
      setShareStatus("Copy failed — try again");
    } finally {
      setCopyImageBusy(false);
      window.setTimeout(() => setShareStatus(""), 5000);
    }
  }, [result, copyImageBusy]);

  const calcSeo = ROUTE_SEO.calculator;
  const signupHref = organicSignupUrl({ medium: "calculator", campaign: "retirement_calc" });

  return (
    <div className="quick-calc-page">
      <SeoHead
        title={calcSeo.title}
        description={calcSeo.description}
        path={calcSeo.path}
        robots={calcSeo.robots}
        jsonLd={calculatorJsonLd()}
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
          <a href={signupHref} className="quick-calc-nav-link quick-calc-nav-link--on-contrast">
            Full app
          </a>
        </div>
      </header>

      <main className="quick-calc-main">
        <section className="quick-calc-hero">
          <h1>How ready are you for retirement?</h1>
          <p className="quick-calc-lead">
            A quick Monte Carlo snapshot: grow with a simple US equity proxy, then stress-test a
            sample income portfolio in retirement. For a full life plan with your holdings, savings,
            and spending — use Quala.
          </p>
        </section>

        <section className="quick-calc-card">
          <div className="tax-est-mode-switch quick-calc-household-switch" role="group" aria-label="Household">
            <button
              type="button"
              className={`tax-est-mode-switch__btn${household === "single" ? " tax-est-mode-switch__btn--active" : ""}`}
              onClick={() => setHousehold("single")}
              disabled={loading}
            >
              I (single)
            </button>
            <button
              type="button"
              className={`tax-est-mode-switch__btn${household === "married" ? " tax-est-mode-switch__btn--active" : ""}`}
              onClick={() => {
                setHousehold("married");
                if (!partnerAge && age) setPartnerAge(age);
                if (!partnerYears && years) setPartnerYears(years);
              }}
              disabled={loading}
            >
              We (married)
            </button>
          </div>
          <p className="tax-est-mode-hint quick-calc-household-hint">
            Couple mode uses one shared portfolio and the later retirement date for spending inflation.
          </p>
          <div className="quick-calc-form-grid">
            <label>
              I am
              <input
                type="number"
                min={18}
                max={90}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={loading}
              />
              years old
            </label>
            <label>
              Retire in
              <input
                type="number"
                min={1}
                max={50}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                disabled={loading}
              />
              years
            </label>
            {household === "married" ? (
              <>
                <label>
                  Partner is
                  <input
                    type="number"
                    min={18}
                    max={90}
                    value={partnerAge}
                    onChange={(e) => setPartnerAge(e.target.value)}
                    disabled={loading}
                  />
                  years old
                </label>
                <label>
                  Partner retires in
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={partnerYears}
                    onChange={(e) => setPartnerYears(e.target.value)}
                    disabled={loading}
                  />
                  years
                </label>
              </>
            ) : null}
            <label className="quick-calc-span2">
              Current portfolio value
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 500000 or 500K"
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                disabled={loading}
              />
            </label>
            <label>
              Monthly savings
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 2000 (optional)"
                value={monthlySavings}
                onChange={(e) => setMonthlySavings(e.target.value)}
                disabled={loading}
              />
            </label>
            <label>
              Monthly spending
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 8000 (optional)"
                value={monthlySpending}
                onChange={(e) => setMonthlySpending(e.target.value)}
                disabled={loading}
              />
            </label>
          </div>
          <p className="quick-calc-hint quick-calc-field-hint">
            Leave monthly spending blank to use a 4% withdrawal rule at retirement instead of a fixed budget.
          </p>
          {error ? <p className="quick-calc-error">{error}</p> : null}
          <button
            type="button"
            className="quick-calc-submit"
            onClick={() => runEstimate()}
            disabled={loading}
          >
            {loading ? "Running simulations…" : "Estimate my retirement success"}
          </button>
          {loading ? (
            <p className="quick-calc-hint">Running Monte Carlo on historical data.</p>
          ) : null}
        </section>

        {result ? (
          <>
            <QuickCalcShareBar
              shareUrl={shareUrl}
              shareTitle="Quala retirement calculator"
              shareText={
                result.retirement_success_percent != null
                  ? `Retirement success: ${Math.round(Number(result.retirement_success_percent))}% — Quala`
                  : "Retirement Monte Carlo snapshot — Quala"
              }
              extraActions={
                <button
                  type="button"
                  className="quick-calc-share-btn"
                  onClick={onCopyImage}
                  disabled={copyImageBusy}
                >
                  {copyImageBusy ? "Copying…" : "Copy image"}
                </button>
              }
            />
            {shareStatus ? (
              <span className="quick-calc-share-status capture-exclude">{shareStatus}</span>
            ) : null}

            <div ref={outputCaptureRef} className="quick-calc-snapshot-capture">
              <div className="quick-calc-snapshot-capture__brand">
                <span className="quick-calc-snapshot-capture__title">Quala AI</span>
                <span className="quick-calc-snapshot-capture__badge">{FREE_CALCULATORS_HEADER_LABEL}</span>
              </div>
              <p className="quick-calc-snapshot-capture__inputs">
                {householdLabel(result.household)} · Age {result.current_age} · Retire in{" "}
                {result.years_to_retirement} years
                {result.household === "married" && result.partner_age != null ? (
                  <>
                    {" "}
                    · Partner age {result.partner_age} · Partner retires in{" "}
                    {result.partner_years_to_retirement} years
                  </>
                ) : null}
                {" "}
                · Household retires at age {result.retirement_age} · Portfolio{" "}
                {fmtUsd(result.portfolio_value_usd)}
                {result.monthly_savings_usd > 0 ? (
                  <>
                    {" "}
                    · Saves {fmtUsd(result.monthly_savings_usd)}/mo
                  </>
                ) : null}
                {result.monthly_spending_usd > 0 ? (
                  <>
                    {" "}
                    · Spends {fmtUsd(result.monthly_spending_usd)}/mo
                  </>
                ) : null}
              </p>

              <section className="quick-calc-results">
                <h2>Your snapshot</h2>
                <div className="quick-calc-metrics" role="group" aria-label="Retirement snapshot metrics">
                  <div className="quick-calc-metric">
                    <span className="quick-calc-metric__label">Median at retirement</span>
                    <span className="quick-calc-metric__value">
                      {fmtUsd(result.growth_median_at_retirement_usd)}
                    </span>
                  </div>
                  <div className="quick-calc-metric">
                    <span className="quick-calc-metric__label">Goal achieved</span>
                    <span className="quick-calc-metric__value">
                      {result.goal_funded_percent != null && Number.isFinite(Number(result.goal_funded_percent))
                        ? `${Math.round(Number(result.goal_funded_percent))}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="quick-calc-metric">
                    <span className="quick-calc-metric__label">Retirement success</span>
                    <span className="quick-calc-metric__value">
                      {result.retirement_success_percent != null &&
                      Number.isFinite(Number(result.retirement_success_percent))
                        ? `${Math.round(Number(result.retirement_success_percent))}%`
                        : "—"}
                    </span>
                  </div>
                </div>
                <p className="quick-calc-stat-line">
                  Median portfolio value at retirement (growth phase, 100% VOO):{" "}
                  <strong>{fmtUsd(result.growth_median_at_retirement_usd)}</strong>
                </p>
              </section>

              <section className="quick-calc-dials-wrap">
                <LifePlannerDials
                  goalFundedPercent={result.goal_funded_percent}
                  retirementSuccessPercent={result.retirement_success_percent}
                  goalLabel="Goal achieved"
                  retirementLabel="Retirement success"
                />
              </section>

              <section className="quick-calc-charts-row" aria-label="Portfolio projections">
                <div className="quick-calc-charts-cell">
                  <h3 className="quick-calc-chart-sub">Growth to retirement</h3>
                  <ChartContainer
                    artifacts={result.growth_artifacts}
                    fullWidth
                    theme={theme}
                    calculatorTeaser
                    enableShareCopy={false}
                  />
                </div>
                <div className="quick-calc-charts-cell">
                  <h3 className="quick-calc-chart-sub">Retirement stress test</h3>
                  <ChartContainer
                    artifacts={result.retirement_artifacts}
                    fullWidth
                    theme={theme}
                    calculatorTeaser
                    enableShareCopy={false}
                  />
                </div>
              </section>

              {result.assumptions_narrative ? (
                <p className="quick-calc-assumptions-narrative">{result.assumptions_narrative}</p>
              ) : null}
            </div>

            <section className="quick-calc-nudge capture-exclude">
              <h3>Want to plan with more detail?</h3>
              <p>
                Add your real holdings, monthly savings, spending, and life scenarios with Quala&apos;s AI
                advisors — then save portfolios and life plans.
              </p>
              <a href={signupHref} className="quick-calc-cta">
                Create / log in to your account
              </a>
            </section>
          </>
        ) : null}

        <section className="quick-calc-faq" aria-labelledby="calc-faq-heading">
          <h2 id="calc-faq-heading">Frequently asked questions</h2>
          <dl className="quick-calc-faq-list">
            {CALCULATOR_FAQ.map((item) => (
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
              <a href="/tax-calculator">Free tax estimator</a>
            </li>
          </ul>
          <h3 className="quick-calc-guides__sub">Guides</h3>
          <ul>
            {listGuideSlugs().map((slug) => {
              const m = getGuideMeta(slug);
              return (
                <li key={slug}>
                  <a href={`/guides/${slug}`}>{m?.title?.split("|")[0]?.trim() || slug}</a>
                </li>
              );
            })}
          </ul>
        </nav>
      </main>
      <LegalStickyFooter />
    </div>
  );
}
