import type { Category, CategoryId } from "../types/calculator";

/**
 * The full category taxonomy. Modeled on the breadth of calculator.net's
 * coverage (NOT its UI). Calculators register against one of these ids.
 */
export const categories: Category[] = [
  {
    id: "finance",
    name: "Finance",
    slug: "finance",
    tagline: "Loans, investments & money decisions",
    description:
      "Model loans, investments, retirement, and taxes — then understand the trade-offs with AI insights and side-by-side scenarios.",
    icon: "M3 3v18h18M7 14l3-3 3 3 5-6",
  },
  {
    id: "health",
    name: "Health",
    slug: "health",
    tagline: "Body, nutrition & fitness",
    description:
      "Understand your body metrics, calorie needs, and fitness targets with clear visual breakdowns and personalized guidance.",
    icon: "M12 21s-7-4.35-9.5-8.5C.5 9 2 5 6 5c2 0 3 1 4 2 1-1 2-2 4-2 4 0 5.5 4 3.5 7.5C19 16.65 12 21 12 21z",
  },
  {
    id: "math",
    name: "Math",
    slug: "math",
    tagline: "Arithmetic, algebra & statistics",
    description:
      "From percentages to probability — solve and visualize math with step-by-step explanations.",
    icon: "M4 4h16M4 4v16M8 8h8M8 12h8M8 16h4",
  },
  {
    id: "utilities",
    name: "Utilities",
    slug: "utilities",
    tagline: "Dates, time & conversions",
    description:
      "Everyday tools for age, dates, time, and unit conversion — fast, accurate, and explained.",
    icon: "M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z",
  },
  {
    id: "engineering",
    name: "Engineering",
    slug: "engineering",
    tagline: "Applied science & design",
    description:
      "Engineering calculations with visual outputs and assumptions made explicit.",
    icon: "M14 6l7 7-7 7M10 18l-7-7 7-7",
  },
  {
    id: "construction",
    name: "Construction",
    slug: "construction",
    tagline: "Materials, area & estimates",
    description:
      "Estimate materials, areas, and project costs with confidence.",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  },
  {
    id: "business",
    name: "Business",
    slug: "business",
    tagline: "Pricing, margins & growth",
    description:
      "Model margins, markups, and growth — and see what drives the numbers.",
    icon: "M3 13h4l3 8 4-16 3 8h4",
  },
  {
    id: "education",
    name: "Education",
    slug: "education",
    tagline: "Grades, GPA & study",
    description: "Track grades and academic targets with clear projections.",
    icon: "M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 3 3 6 3s6-2 6-3v-5",
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    slug: "lifestyle",
    tagline: "Everyday personal planning",
    description: "Practical calculators for everyday personal decisions.",
    icon: "M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6z",
  },
  {
    id: "travel",
    name: "Travel",
    slug: "travel",
    tagline: "Trips, fuel & distance",
    description: "Plan trips, fuel costs, and distances with visual summaries.",
    icon: "M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20",
  },
];

export const categoryMap = new Map<CategoryId, Category>(
  categories.map((c) => [c.id, c]),
);

export function getCategory(id: CategoryId): Category {
  const c = categoryMap.get(id);
  if (!c) throw new Error(`Unknown category: ${id}`);
  return c;
}

/**
 * Calculator chains — ordered workflows where each calculator's output
 * naturally feeds the next decision. The architecture supports AI-generated
 * chains in future; these are the curated starters.
 */
export interface CalculatorChain {
  id: string;
  title: string;
  description: string;
  /** Ordered calculator slugs. */
  steps: string[];
}

export const chains: CalculatorChain[] = [
  {
    id: "salary-to-retirement",
    title: "Salary → Retirement",
    description:
      "Turn a monthly salary into a complete plan: budget, invest, and project retirement.",
    steps: ["percentage", "sip", "compound-interest"],
  },
  {
    id: "home-buying",
    title: "Buying a Home",
    description:
      "Size up affordability and the true cost of a mortgage before you commit.",
    steps: ["emi", "compound-interest"],
  },
  {
    id: "health-baseline",
    title: "Health Baseline",
    description: "Establish your body metrics and build targets around them.",
    steps: ["bmi"],
  },
];
