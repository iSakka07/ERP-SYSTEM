export type CostControlTotals = {
  contractValueCents: number;
  certifiedRevenueCents: number;
  collectedCents: number;
  subcontractorsCents: number;
  subcontractorCashCents: number;
  purchasesCents: number;
  salariesCents: number;
  paidSalariesCents: number;
  pettyCashCents: number;
};

const percent = (value: number, base: number) => base > 0 ? (value / base) * 100 : null;

export function buildCostControlTotals(totals: CostControlTotals) {
  const totalCostCents = totals.subcontractorsCents + totals.purchasesCents + totals.salariesCents + totals.pettyCashCents;
  const profitToDateCents = totals.certifiedRevenueCents - totalCostCents;
  const cashOutCents = totals.subcontractorCashCents + totals.paidSalariesCents + totals.pettyCashCents;
  const netCashPositionCents = totals.collectedCents - cashOutCents;

  return {
    revenue: {
      contractValueCents: totals.contractValueCents,
      certifiedRevenueCents: totals.certifiedRevenueCents,
      collectedCents: totals.collectedCents,
      outstandingCents: totals.certifiedRevenueCents - totals.collectedCents,
      executionPercent: percent(totals.certifiedRevenueCents, totals.contractValueCents),
      collectionPercent: percent(totals.collectedCents, totals.certifiedRevenueCents),
    },
    cost: {
      subcontractorsCents: totals.subcontractorsCents,
      purchasesCents: totals.purchasesCents,
      salariesCents: totals.salariesCents,
      pettyCashCents: totals.pettyCashCents,
      totalCostCents,
    },
    performance: {
      profitToDateCents,
      marginPercent: percent(profitToDateCents, totals.certifiedRevenueCents),
      costRatioPercent: percent(totalCostCents, totals.certifiedRevenueCents),
    },
    cash: {
      cashInCents: totals.collectedCents,
      cashOutCents,
      netCashPositionCents,
      companyFinancingCents: Math.max(0, -netCashPositionCents),
      supplierPaymentsIncluded: false as const,
    },
  };
}
