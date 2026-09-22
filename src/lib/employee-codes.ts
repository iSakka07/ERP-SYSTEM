export const employeeJobPrefixes = {
  "سائق": "DRV",
  "مهندس موقع": "ENG",
  "مهندس مكتب فني": "TOE",
  "مشرف": "SUP",
  "مدير مشاريع": "PME",
  "مدير تنفيذي": "CEO",
  "محاسب": "ACC",
} as const;

export type EmployeeJobTitle = keyof typeof employeeJobPrefixes;

export function nextEmployeeCode(prefix: string, existingCodes: string[]) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const largest = existingCodes.reduce((max, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(largest + 1).padStart(3, "0")}`;
}
