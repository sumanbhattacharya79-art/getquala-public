import { absoluteUrl, ROUTE_SEO, SITE_URL, organicSignupUrl } from "./seoConfig.js";

const TAX = ROUTE_SEO.taxCalculator;

export const TAX_CALCULATOR_FAQ = [
  {
    question: "What does this free tax estimator show?",
    answer:
      "A simplified federal and state tax snapshot using PolicyEngine-style rules plus IRMAA and Medicare surcharge estimates. Choose this year only, or the first five years after your planned retirement using a taxable → IRA → Roth withdrawal order.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. The free estimator runs without signing in. Create a Quala account to run full lifecycle projections, compare withdrawal strategies, optimize Roth conversions, and compare states.",
  },
  {
    question: "How is this different from the full tax estimation tool?",
    answer:
      "The free version limits retirement mode to five years, uses one standard withdrawal sequence, and does not include strategy search, state-by-state comparison, or the tax optimizer. Logged-in users get age-by-age projections through age 100 and advanced planning tools.",
  },
  {
    question: "Is this tax advice?",
    answer:
      "No. Results are educational estimates with simplifying assumptions. Consult a qualified tax professional before making decisions.",
  },
  {
    question: "How long does an estimate take?",
    answer:
      "Current-year and five-year retirement snapshots use a fast estimate path on the server.",
  },
  {
    question: "Can I share my estimate?",
    answer:
      "Yes. After you run an estimate, use Copy link to get a unique URL (e.g. getquala.dev/tax-calculator/s/…) that reopens the same inputs and recalculates for anyone who visits.",
  },
];

/** Sign up / log in and open full tax estimation after auth. */
export function taxMinimizeSignupUrl() {
  const base = organicSignupUrl({ medium: "calculator", campaign: "tax_minimize" });
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}intent=tax`;
}

export function taxCalculatorJsonLd() {
  const url = absoluteUrl(TAX.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Quala AI Free Tax Estimator",
      url,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: TAX.description,
      provider: { "@type": "Organization", name: "Quala AI", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: TAX_CALCULATOR_FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];
}
