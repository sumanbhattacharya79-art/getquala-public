"""Public free tax calculator (no login): current-year or 5 retirement years only."""

from __future__ import annotations

from typing import Any, Dict, Literal

from backend.quick_calculator_share import create_quick_calculator_share
from tax_estimation.service import estimate_taxes

QUICK_TAX_RETIREMENT_YEARS = 5


def run_quick_tax_estimate(
    *,
    estimate_mode: Literal["current_year", "after_retirement"],
    age: int,
    years_until_retirement: int,
    filing_status: str,
    state_code: str,
    employment_income: float = 0.0,
    annual_retirement_spending: float = 0.0,
    taxable_brokerage_balance: float = 0.0,
    traditional_ira_balance: float = 0.0,
    roth_ira_balance: float = 0.0,
    social_security_monthly: float = 0.0,
    social_security_start_age: int = 62,
) -> Dict[str, Any]:
    """
    PolicyEngine + IRMAA snapshot without optimizer, state compare, or strategy compare.
    """
    age = int(age)
    years_until_retirement = max(0, min(50, int(years_until_retirement)))
    retirement_age = age + years_until_retirement
    is_retirement = estimate_mode == "after_retirement"

    if is_retirement and annual_retirement_spending <= 0:
        raise ValueError("Enter annual retirement spending for the 5-year projection.")

    profile: Dict[str, Any] = {
        "estimate_mode": "after_retirement" if is_retirement else "current_year",
        "age": age,
        "current_age": age,
        "filing_status": (filing_status or "single").strip().lower(),
        "state_code": (state_code or "CA").strip().upper()[:2],
        "employment_income": max(0.0, float(employment_income)),
        "pre_retirement_employment_income": max(0.0, float(employment_income)),
        "enable_lifecycle_projection": is_retirement,
        "projection_start_at_retirement": True,
        "lifecycle_projection_years": QUICK_TAX_RETIREMENT_YEARS,
        "projection_end_age": min(100, retirement_age + QUICK_TAX_RETIREMENT_YEARS - 1),
        "withdrawal_strategy": "traditional_sequence" if is_retirement else "manual",
        "annual_retirement_spending": max(0.0, float(annual_retirement_spending)),
        "taxable_brokerage_balance": max(0.0, float(taxable_brokerage_balance)),
        "traditional_ira_balance": max(0.0, float(traditional_ira_balance)),
        "roth_ira_balance": max(0.0, float(roth_ira_balance)),
        "taxable_balance_growth_rate": 0.05,
        "roth_balance_growth_rate": 0.05,
        "ira_balance_growth_rate": 0.05,
        "taxable_withdrawal_ltcg_pct": 0.85,
        "taxable_portfolio_yield_rate": 0.02,
        "social_security_monthly": max(0.0, float(social_security_monthly)),
        "social_security_start_age": max(62, min(70, int(social_security_start_age))),
        "enrolled_medicare_part_d": True,
        "medicare_enrollees": 1,
        "quick_calculator": True,
    }
    if is_retirement:
        profile["years_until_retirement"] = years_until_retirement
        profile["retirement_age"] = retirement_age
    else:
        # Current-year mode: frontend sends years_until_retirement=0; that would set
        # retirement_age == age and zero out W-2 via _employment_income.
        profile["retirement_age"] = max(age + 1, 67)

    raw = estimate_taxes(profile)
    out = _shape_quick_response(raw, is_retirement=is_retirement)
    share = create_quick_calculator_share(
        "tax",
        {
            "estimate_mode": estimate_mode,
            "age": age,
            "years_until_retirement": years_until_retirement,
            "filing_status": filing_status,
            "state_code": state_code,
            "employment_income": employment_income,
            "annual_retirement_spending": annual_retirement_spending,
            "taxable_brokerage_balance": taxable_brokerage_balance,
            "traditional_ira_balance": traditional_ira_balance,
            "roth_ira_balance": roth_ira_balance,
            "social_security_monthly": social_security_monthly,
            "social_security_start_age": social_security_start_age,
        },
    )
    out["share_id"] = share["share_id"]
    out["share_url"] = share["share_url"]
    return out


def _shape_quick_response(raw: Dict[str, Any], *, is_retirement: bool) -> Dict[str, Any]:
    """Trim payload for public calculator UI."""
    lifecycle = raw.get("lifecycle_projection") or []
    summary = raw.get("lifecycle_summary") or raw.get("summary") or {}

    out: Dict[str, Any] = {
        "quick_calculator": True,
        "estimate_mode": raw.get("estimate_mode"),
        "tax_year": raw.get("tax_year"),
        "age": raw.get("age"),
        "current_age": raw.get("current_age"),
        "retirement_age": raw.get("retirement_age"),
        "policyengine_status": raw.get("policyengine_status"),
        "magi": raw.get("magi"),
        "effective_tax_rate": raw.get("effective_tax_rate"),
        "total_gross_tax": raw.get("total_gross_tax"),
        "total_with_irmaa_and_penalties": raw.get("total_with_irmaa_and_penalties"),
        "total_estimated_tax_burden": raw.get("total_estimated_tax_burden"),
        "federal_income_tax": raw.get("federal_income_tax"),
        "state_income_tax": raw.get("state_income_tax"),
        "net_investment_income_tax": raw.get("net_investment_income_tax"),
        "irmaa": raw.get("irmaa"),
        "breakdown": raw.get("breakdown"),
        "warnings": raw.get("warnings") or [],
        "summary_label": raw.get("summary_label"),
    }

    if is_retirement:
        rows = []
        for r in lifecycle[:QUICK_TAX_RETIREMENT_YEARS]:
            rows.append(
                {
                    "age": r.get("age"),
                    "tax_year": r.get("tax_year"),
                    "total_gross_tax": r.get("total_gross_tax"),
                    "total_estimated_tax_burden": r.get("total_estimated_tax_burden"),
                    "effective_tax_rate": r.get("effective_tax_rate"),
                    "magi": r.get("magi"),
                    "federal_income_tax": r.get("federal_income_tax"),
                    "state_income_tax": r.get("state_income_tax"),
                    "irmaa_annual": r.get("irmaa_annual"),
                }
            )
        out["lifecycle_projection"] = rows
        out["lifecycle_summary"] = {
            "lifetime_gross_taxes": summary.get("lifetime_gross_taxes"),
            "lifetime_effective_tax_rate": summary.get("lifetime_effective_tax_rate"),
            "average_annual_gross_tax": summary.get("average_annual_gross_tax"),
            "peak_annual_gross_tax": summary.get("peak_annual_gross_tax"),
            "peak_tax_age": summary.get("peak_tax_age"),
            "years_in_view": len(rows),
        }
        out["projection_years"] = QUICK_TAX_RETIREMENT_YEARS
    else:
        out["income_inputs"] = raw.get("income_inputs")

    return out
