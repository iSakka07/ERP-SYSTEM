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
  bankExpensesCents: number;
  ownerMaterialsCents: number;
  supplierPaymentsCents: number;
};

const percent = (value: number, base: number) => base > 0 ? (value / base) * 100 : null;

export function buildCostControlTotals(totals: CostControlTotals) {
  // Owner-supplied materials are deducted from the contractor's entitlement,
  // but they are not a cash cost incurred by the company. Keep them as a
  // separate analytical value and do not add them to the company's cost.
  const totalCostCents = totals.subcontractorsCents + totals.purchasesCents + totals.salariesCents + totals.pettyCashCents + totals.bankExpensesCents;
  const profitToDateCents = totals.certifiedRevenueCents - totalCostCents;
  const cashOutCents = totals.subcontractorCashCents + totals.paidSalariesCents + totals.pettyCashCents + totals.supplierPaymentsCents;
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
      bankExpensesCents: totals.bankExpensesCents,
      ownerMaterialsCents: totals.ownerMaterialsCents,
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
      supplierPaymentsIncluded: true as const,
    },
  };
}
