import { absoluteUrl, ROUTE_SEO, SITE_URL } from "./seoConfig.js";

const CALC = ROUTE_SEO.calculator;

export const CALCULATOR_FAQ = [
  {
    question: "What does this retirement calculator show?",
    answer:
      "A quick Monte Carlo snapshot: your portfolio is grown with a simple US equity proxy until retirement, then stress-tested in a sample retirement portfolio. You see median growth at retirement and two dials for goal funding and retirement success.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. The free calculator runs without signing in. Create a Quala account to save holdings, spending, tax assumptions, and full life scenarios.",
  },
  {
    question: "Is this financial advice?",
    answer:
      "No. Results are hypothetical simulations using delayed or historical data. Verify all figures before making decisions; this is not personalized investment, tax, or legal advice.",
  },
  {
    question: "How long does the estimate take?",
    answer: "Runs use historical price data on the server; first-time ticker downloads can take longer. After you run an estimate, use Copy link to get a unique URL (e.g. getquala.dev/retirement-calculator/s/…) that restores your inputs for anyone who opens it.",
  },
];

export function calculatorJsonLd() {
  const url = absoluteUrl(CALC.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Quala AI Free Retirement Calculator",
      url,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: CALC.description,
      provider: { "@type": "Organization", name: "Quala AI", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: CALCULATOR_FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];
}
