export const CATEGORY_COLORS: Record<string, string> = {
  Utilities:     "#6366f1",
  Rent:          "#8b5cf6",
  Housing:       "#8b5cf6",
  Subscription:  "#a78bfa",
  Subscriptions: "#a78bfa",
  Insurance:     "#10b981",
  Debt:          "#f59e0b",
  Other:         "#64748b",
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}
