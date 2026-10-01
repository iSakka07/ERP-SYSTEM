export const costCategories = { SUBCONTRACTORS: "المقاولون", MATERIALS: "الخامات", SALARIES: "الرواتب", OTHER: "مصروفات أخرى" } as const;
export type CostCategory = keyof typeof costCategories;
export type ProjectBudget = Record<CostCategory, number>;

export function projectForecast(actualCents: number, contractCents: number, budget: ProjectBudget | null, progress: number | null, commitmentsCents: number) {
  const budgetCents = budget ? Object.values(budget).reduce((sum, value) => sum + value, 0) : null;
  const finalCents = progress !== null && progress > 0 ? Math.round(actualCents * 100 / progress) : null;
  const remainingCents = finalCents === null ? null : Math.max(0, finalCents - actualCents);
  return {
    budgetCents, finalCents, remainingCents,
    profitCents: finalCents === null ? null : contractCents - finalCents,
    overrunCents: finalCents === null || budgetCents === null ? null : Math.max(0, finalCents - budgetCents),
    commitmentGapCents: remainingCents === null ? null : Math.max(0, commitmentsCents - remainingCents),
    completedWithCommitments: progress === 100 && commitmentsCents > 0,
  };
}

