export type SalaryAllocationInput = { projectId: string | null; startDate: Date; endDate: Date | null };

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
