export type SalaryAllocationInput = { projectId: string | null; startDate: Date; endDate: Date | null };
export type EmployeeStatusPeriodInput = { startDate: Date; endDate: Date | null };
export type SalaryDistribution = { projectId: string | null; days: number; cents: number };
export type SalaryRateInput = { startDate: Date; monthlySalaryCents: number };

export function monthDays(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysInPeriod(start: Date, end: Date | null, year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const from = start > first ? start : first;
  const to = !end || end > last ? last : end;
  return to < from ? 0 : Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

export function intersectSalaryPeriods(
  allocations: SalaryAllocationInput[],
  statusPeriods: EmployeeStatusPeriodInput[],
) {
  return allocations.flatMap((allocation) =>
    statusPeriods.flatMap((period) => {
      const startDate = allocation.startDate > period.startDate ? allocation.startDate : period.startDate;
      const allocationEnd = allocation.endDate ?? new Date("9999-12-31T00:00:00.000Z");
      const periodEnd = period.endDate ?? new Date("9999-12-31T00:00:00.000Z");
      const end = allocationEnd < periodEnd ? allocationEnd : periodEnd;
      return end < startDate ? [] : [{ projectId: allocation.projectId, startDate, endDate: end }];
    }),
  );
}

export function activeDaysInMonth(month: string, periods: EmployeeStatusPeriodInput[]) {
  const [year, monthNumber] = month.split("-").map(Number);
  return periods.reduce((sum, period) => sum + daysInPeriod(period.startDate, period.endDate, year, monthNumber), 0);
}

export function buildPayrollDistribution(
  month: string,
  monthlySalaryCents: number,
  allocations: SalaryAllocationInput[],
  statusPeriods: EmployeeStatusPeriodInput[],
  salaryRates: SalaryRateInput[] = [],
): SalaryDistribution[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = monthDays(month);
  const rates = [...salaryRates].sort((a, b) => +a.startDate - +b.startDate);
  const rateAt = (date: Date) => rates.filter((rate) => rate.startDate <= date).at(-1)?.monthlySalaryCents ?? monthlySalaryCents;
  const isInPeriod = (date: Date, period: EmployeeStatusPeriodInput | SalaryAllocationInput) => date >= period.startDate && (!period.endDate || date <= period.endDate);
  const pieces: { projectId: string | null; days: number; cents: number; rate: number }[] = [];
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    if (!statusPeriods.some((period) => isInPeriod(date, period))) continue;
    const allocation = allocations.filter((item) => isInPeriod(date, item));
    if (allocation.length > 1) throw new Error("تسكين الموظف متداخل خلال الشهر.");
    const projectId = allocation[0]?.projectId ?? null;
    const rate = rateAt(date);
    const previous = pieces.at(-1);
    if (previous && previous.projectId === projectId && previous.rate === rate) previous.days += 1;
    else pieces.push({ projectId, days: 1, cents: 0, rate });
  }
  pieces.forEach((piece) => { piece.cents = Math.floor((piece.rate * piece.days) / days); });
  for (const rate of new Set(pieces.map((piece) => piece.rate))) {
    const group = pieces.filter((piece) => piece.rate === rate);
    let residue = Math.floor((rate * group.reduce((sum, piece) => sum + piece.days, 0)) / days) - group.reduce((sum, piece) => sum + piece.cents, 0);
    group.forEach((piece) => { if (residue > 0) { piece.cents += 1; residue -= 1; } });
  }
  return pieces.map(({ rate: _rate, ...piece }) => piece);
}

export function allocateMonthlySalary(month: string, monthlySalaryCents: number, allocations: SalaryAllocationInput[]) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = monthDays(month);
  const units = allocations.map((allocation) => ({ projectId: allocation.projectId, days: daysInPeriod(allocation.startDate, allocation.endDate, year, monthNumber) })).filter((allocation) => allocation.days > 0);
  const covered = units.reduce((sum, allocation) => sum + allocation.days, 0);
  if (covered > days) throw new Error("تسكين الموظف متداخل خلال الشهر.");
  if (covered < days) units.push({ projectId: null, days: days - covered });
  const result = units.map((allocation) => ({ ...allocation, cents: Math.floor(monthlySalaryCents * allocation.days / days) }));
  let residue = monthlySalaryCents - result.reduce((sum, allocation) => sum + allocation.cents, 0);
  result.forEach((allocation) => { if (residue > 0) { allocation.cents += 1; residue -= 1; } });
  return result;
}
