"""
Public teaser: growth (VOO) → retirement (NOBL/SCHD/VNQ) backtests with default intake.
"""

from __future__ import annotations

import datetime
import logging
import uuid
from typing import Any, Dict, List, Literal, Optional

from backtesting.backtesting_service.types import retirement_expense_inflation_years

from fastapi import HTTPException

from backend.quick_calculator_share import create_quick_calculator_share
from backend.saved_portfolio_backtest import (
    enrich_artifacts_intake_timeline_markers,
    run_backtest_for_saved_portfolio,
)

_log = logging.getLogger(__name__)

GROWTH_WEIGHTS = {"VOO": 1.0}
RETIREMENT_WEIGHTS = {"NOBL": 0.3, "SCHD": 0.4, "VNQ": 0.3}
WITHDRAWAL_RATE = 0.04
INFLATION_RATE_PCT = 3.0


def _assumptions_narrative(
    *,
    monthly_savings: float,
    monthly_spending: float,
    household: str,
    current_age: int,
    years_to_retirement: int,
    partner_age: Optional[int] = None,
    partner_years_to_retirement: Optional[int] = None,
) -> str:
    savings_bit = (
        f"Monthly savings of ${monthly_savings:,.0f} are added to the portfolio until retirement. "
        if monthly_savings > 0
        else "No extra monthly savings are added until retirement. "
    )
    if monthly_spending > 0:
        spend_bit = (
            f"Retirement spending starts at ${monthly_spending:,.0f}/month (today's dollars), "
            f"inflated {INFLATION_RATE_PCT:.0f}% per year in the stress test. "
        )
    else:
        spend_bit = (
            "Retirement spending is modeled as 4% of the median portfolio at retirement "
            "(paid monthly), with withdrawals rising 3% per year for inflation. "
        )
    if household == "married" and partner_age is not None and partner_years_to_retirement is not None:
        schedule = _couple_schedule(
            current_age=current_age,
            years_to_retirement=years_to_retirement,
            partner_age=partner_age,
            partner_years_to_retirement=partner_years_to_retirement,
            household="married",
        )
        household_bit = (
            f"Household: you retire at age {schedule['self_retirement_age']} "
            f"(in {years_to_retirement} years), partner at age {schedule['partner_retirement_age']} "
            f"(in {partner_years_to_retirement} years). Growth runs until the later date; "
            "retirement stress-test starts then. "
        )
    elif household == "married":
        household_bit = (
            "Household planning assumes a married couple with one shared portfolio. "
        )
    else:
        household_bit = "Household planning assumes a single person. "
    return (
        "Growth phase uses a 100% VOO (US large-cap) proxy. "
        f"{savings_bit}"
        "At retirement, decumulation uses 30% NOBL, 40% SCHD, and 30% VNQ. "
        f"{spend_bit}"
        f"{household_bit}"
        "No Social Security, pension, or taxes are modeled. "
        "This is a hypothetical illustration using historical data—not financial advice."
    )


def _growth_none_scenario(artifacts: Dict[str, Any]) -> dict:
    for s in artifacts.get("scenarios") or []:
        if not isinstance(s, dict):
            continue
        name = str(s.get("scenario") or "").strip().lower()
        if name == "none" or "no rebalancing" in name:
            return s
    scenarios = artifacts.get("scenarios") or []
    if len(scenarios) >= 3:
        return scenarios[1] if isinstance(scenarios[1], dict) else {}
    return scenarios[0] if scenarios and isinstance(scenarios[0], dict) else {}


def _terminal_value_p50(artifacts: Optional[Dict[str, Any]]) -> Optional[float]:
    if not artifacts:
        return None
    row = _growth_none_scenario(artifacts)
    mc = row.get("monte_carlo") or {}
    raw = mc.get("terminal_value_p50")
    try:
        v = float(raw)
        return v if v > 0 and v == v else None
    except (TypeError, ValueError):
        return None


def _display_unit_for_value(usd: float) -> Optional[str]:
    if usd >= 1_000_000:
        return "M"
    if usd >= 10_000:
        return "K"
    return None


def _couple_schedule(
    *,
    current_age: int,
    years_to_retirement: int,
    partner_age: Optional[int],
    partner_years_to_retirement: Optional[int],
    household: Literal["single", "married"],
) -> Dict[str, int]:
    """Ages and horizons for single vs married (decumulation starts when the later spouse retires)."""
    self_ret_age = int(current_age) + int(years_to_retirement)
    if household != "married" or partner_age is None or partner_years_to_retirement is None:
        y = int(years_to_retirement)
        return {
            "self_retirement_age": self_ret_age,
            "partner_retirement_age": self_ret_age,
            "household_retirement_age": self_ret_age,
            "growth_years": y,
            "spending_inflation_years": y,
        }
    py = int(partner_years_to_retirement)
    partner_ret_age = int(partner_age) + py
    growth_years = max(int(years_to_retirement), py)
    household_ret = max(self_ret_age, partner_ret_age)
    infl_y = retirement_expense_inflation_years(
        "couple",
        "both_working",
        None,
        f"{int(years_to_retirement)} years",
        f"{py} years",
    )
    return {
        "self_retirement_age": self_ret_age,
        "partner_retirement_age": partner_ret_age,
        "household_retirement_age": household_ret,
        "growth_years": growth_years,
        "spending_inflation_years": infl_y,
    }


def _intake_dict(
    *,
    current_age: int,
    years_to_retirement: int,
    portfolio_value_usd: float,
    initial_value: Optional[float] = None,
    for_retirement: bool,
    monthly_savings: float = 0.0,
    monthly_spending: float = 0.0,
    household: Literal["single", "married"] = "single",
    partner_age: Optional[int] = None,
    partner_years_to_retirement: Optional[int] = None,
) -> Dict[str, Any]:
    now = datetime.datetime.now()
    birth_year = now.year - int(current_age)
    schedule = _couple_schedule(
        current_age=current_age,
        years_to_retirement=years_to_retirement,
        partner_age=partner_age,
        partner_years_to_retirement=partner_years_to_retirement,
        household=household,
    )
    household_ret_age = schedule["household_retirement_age"]
    growth_years = schedule["growth_years"]
    longevity = max(1, min(100, 100 - household_ret_age))
    monthly_anchor = max(500.0, float(portfolio_value_usd) * WITHDRAWAL_RATE / 12.0)
    spend = float(monthly_spending) if monthly_spending > 0 else monthly_anchor
    savings = max(0.0, float(monthly_savings))
    planning_for = "couple" if household == "married" else "self"
    iv = float(initial_value if initial_value is not None else portfolio_value_usd)
    du = _display_unit_for_value(max(iv, float(portfolio_value_usd)))

    birth_dates: List[Dict[str, int]] = [{"year": birth_year, "month": 6}]
    if household == "married" and partner_age is not None:
        birth_dates.append({"year": now.year - int(partner_age), "month": 6})

    base: Dict[str, Any] = {
        "birth_dates": birth_dates,
        "planning_for": planning_for,
        "initial_value": iv,
        "monthly_savings": savings,
        "display_unit": du,
        "inflation_assumption": INFLATION_RATE_PCT,
        "current_monthly_expense": spend,
        "longevity_years": longevity,
    }
    if household == "married" and partner_years_to_retirement is not None:
        base["retirement_timeline_self"] = f"{int(years_to_retirement)} years"
        base["retirement_timeline_partner"] = f"{int(partner_years_to_retirement)} years"

    if for_retirement:
        base.update(
            {
                "horizon_years": 0,
                "retirement_status": "both_retired",
                "retirement_portfolio_start_age": household_ret_age,
                "retirement_portfolio_end_age": 100,
            }
        )
    else:
        growth_end_age = int(current_age) + growth_years
        base.update(
            {
                "horizon_years": growth_years,
                "retirement_status": "both_working",
                "growth_portfolio_start_age": int(current_age),
                "growth_portfolio_end_age": growth_end_age,
            }
        )
    return base


def _goal_funded_percent(current_usd: float, median_at_retirement: Optional[float]) -> Optional[float]:
    if median_at_retirement is None or median_at_retirement <= 0:
        return None
    if current_usd <= 0:
        return None
    return min(100.0, max(0.0, (float(current_usd) / float(median_at_retirement)) * 100.0))


def _retirement_success_percent(artifacts: Optional[Dict[str, Any]]) -> Optional[float]:
    if not artifacts:
        return None
    scenarios = artifacts.get("scenarios") or []
    if not scenarios:
        return None
    row = scenarios[1] if len(scenarios) >= 3 and isinstance(scenarios[1], dict) else scenarios[0]
    if not isinstance(row, dict):
        return None
    mc = row.get("monte_carlo") or {}
    raw = mc.get("probability_of_success")
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None
    if not (n == n):  # NaN
        return None
    if n > 1:
        return min(100.0, n)
    if n < 0:
        return None
    return min(100.0, max(0.0, n * 100.0))


def run_quick_retirement_estimate(
    *,
    current_age: int,
    years_to_retirement: int,
    portfolio_value_usd: float,
    monthly_savings_usd: float = 0.0,
    monthly_spending_usd: float = 0.0,
    household: Literal["single", "married"] = "single",
    partner_age: Optional[int] = None,
    partner_years_to_retirement: Optional[int] = None,
) -> Dict[str, Any]:
    if current_age < 18 or current_age > 90:
        raise HTTPException(status_code=400, detail="Age must be between 18 and 90.")
    if years_to_retirement < 1 or years_to_retirement > 50:
        raise HTTPException(status_code=400, detail="Years to retirement must be between 1 and 50.")
    if portfolio_value_usd <= 0:
        raise HTTPException(status_code=400, detail="Portfolio value must be positive.")
    if monthly_savings_usd < 0:
        raise HTTPException(status_code=400, detail="Monthly savings cannot be negative.")
    if monthly_spending_usd < 0:
        raise HTTPException(status_code=400, detail="Monthly spending cannot be negative.")
    if household not in ("single", "married"):
        raise HTTPException(status_code=400, detail="Household must be single or married.")
    if household == "married":
        if partner_age is None or partner_age < 18 or partner_age > 90:
            raise HTTPException(status_code=400, detail="Partner age must be between 18 and 90.")
        if partner_years_to_retirement is None or partner_years_to_retirement < 1 or partner_years_to_retirement > 50:
            raise HTTPException(status_code=400, detail="Partner years to retirement must be between 1 and 50.")

    monthly_savings_usd = float(monthly_savings_usd)
    monthly_spending_usd = float(monthly_spending_usd)
    schedule = _couple_schedule(
        current_age=current_age,
        years_to_retirement=years_to_retirement,
        partner_age=partner_age,
        partner_years_to_retirement=partner_years_to_retirement,
        household=household,
    )
    retirement_age = schedule["household_retirement_age"]
    growth_intake = _intake_dict(
        current_age=current_age,
        years_to_retirement=years_to_retirement,
        portfolio_value_usd=portfolio_value_usd,
        for_retirement=False,
        monthly_savings=monthly_savings_usd,
        monthly_spending=monthly_spending_usd,
        household=household,
        partner_age=partner_age,
        partner_years_to_retirement=partner_years_to_retirement,
    )
    growth_id = f"quick-growth-{uuid.uuid4()}"
    growth_artifacts = run_backtest_for_saved_portfolio(
        portfolio_id=growth_id,
        portfolio_weights=dict(GROWTH_WEIGHTS),
        user_intake=growth_intake,
        is_retirement=False,
        use_portfolio_mark_for_initial=False,
        quick_calculator=True,
    )
    if not growth_artifacts or not growth_artifacts.get("scenarios"):
        raise HTTPException(
            status_code=503,
            detail="Growth projection failed. Market data may be unavailable; try again shortly.",
        )

    median_at_retirement = _terminal_value_p50(growth_artifacts)
    if median_at_retirement is None or median_at_retirement <= 0:
        raise HTTPException(status_code=503, detail="Could not compute median portfolio value at retirement.")

    enrich_artifacts_intake_timeline_markers(growth_artifacts, growth_intake, is_retirement=False)
    growth_ui = dict(growth_intake)
    growth_artifacts["intake"] = growth_ui
    growth_artifacts.setdefault("portfolio_composition", dict(GROWTH_WEIGHTS))

    ret_intake = _intake_dict(
        current_age=current_age,
        years_to_retirement=years_to_retirement,
        portfolio_value_usd=portfolio_value_usd,
        initial_value=median_at_retirement,
        for_retirement=True,
        monthly_savings=monthly_savings_usd,
        monthly_spending=monthly_spending_usd,
        household=household,
        partner_age=partner_age,
        partner_years_to_retirement=partner_years_to_retirement,
    )
    if monthly_spending_usd <= 0:
        ret_intake["current_monthly_expense"] = max(
            500.0, float(median_at_retirement) * WITHDRAWAL_RATE / 12.0
        )
    infl = (1.0 + INFLATION_RATE_PCT / 100.0) ** int(schedule["spending_inflation_years"])
    ret_intake["retirement_monthly_target"] = (
        float(monthly_spending_usd) * infl
        if monthly_spending_usd > 0
        else ret_intake["current_monthly_expense"]
    )
    ret_id = f"quick-retire-{uuid.uuid4()}"
    retirement_artifacts = run_backtest_for_saved_portfolio(
        portfolio_id=ret_id,
        portfolio_weights=dict(RETIREMENT_WEIGHTS),
        user_intake=ret_intake,
        is_retirement=True,
        use_portfolio_mark_for_initial=False,
        quick_calculator=True,
    )
    if not retirement_artifacts or not retirement_artifacts.get("scenarios"):
        raise HTTPException(
            status_code=503,
            detail="Retirement projection failed. Market data may be unavailable; try again shortly.",
        )

    enrich_artifacts_intake_timeline_markers(retirement_artifacts, ret_intake, is_retirement=True)
    retirement_artifacts["intake"] = dict(ret_intake)
    retirement_artifacts.setdefault("retirement_composition", dict(RETIREMENT_WEIGHTS))
    retirement_artifacts["is_retirement"] = True
    retirement_artifacts["retirement_age"] = retirement_age

    goal_pct = _goal_funded_percent(portfolio_value_usd, median_at_retirement)
    success_pct = _retirement_success_percent(retirement_artifacts)

    share = create_quick_calculator_share(
        "retirement",
        {
            "current_age": current_age,
            "years_to_retirement": years_to_retirement,
            "portfolio_value_usd": portfolio_value_usd,
            "monthly_savings_usd": monthly_savings_usd,
            "monthly_spending_usd": monthly_spending_usd,
            "household": household,
            "partner_age": partner_age,
            "partner_years_to_retirement": partner_years_to_retirement,
        },
    )

    spend_label = (
        f"${monthly_spending_usd:,.0f}/mo (today's dollars)"
        if monthly_spending_usd > 0
        else f"{WITHDRAWAL_RATE:.0%} of median portfolio at retirement, divided monthly"
    )

    return {
        "status": "ok",
        "share_id": share["share_id"],
        "share_url": share["share_url"],
        "current_age": current_age,
        "years_to_retirement": years_to_retirement,
        "retirement_age": retirement_age,
        "self_retirement_age": schedule["self_retirement_age"],
        "partner_retirement_age": schedule["partner_retirement_age"],
        "portfolio_value_usd": portfolio_value_usd,
        "monthly_savings_usd": monthly_savings_usd,
        "monthly_spending_usd": monthly_spending_usd,
        "household": household,
        "partner_age": partner_age,
        "partner_years_to_retirement": partner_years_to_retirement,
        "planning_for": "couple" if household == "married" else "self",
        "growth_median_at_retirement_usd": median_at_retirement,
        "goal_funded_percent": goal_pct,
        "retirement_success_percent": success_pct,
        "growth_artifacts": growth_artifacts,
        "retirement_artifacts": retirement_artifacts,
        "assumptions": {
            "growth_portfolio": "100% VOO (US large-cap proxy)",
            "retirement_portfolio": "30% NOBL, 40% SCHD, 30% VNQ",
            "monthly_savings": monthly_savings_usd,
            "monthly_spending": monthly_spending_usd,
            "household": household,
            "retirement_spending": spend_label,
            "inflation": f"{INFLATION_RATE_PCT:.0f}% annual increase on retirement withdrawals",
            "rebalancing": "No rebalancing (growth); retirement engine defaults",
        },
        "assumptions_narrative": _assumptions_narrative(
            monthly_savings=monthly_savings_usd,
            monthly_spending=monthly_spending_usd,
            household=household,
            current_age=current_age,
            years_to_retirement=years_to_retirement,
            partner_age=partner_age,
            partner_years_to_retirement=partner_years_to_retirement,
        ),
    }
