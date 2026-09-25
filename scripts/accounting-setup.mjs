import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const chart = [
  ["1000", "الأصول", "ASSET", null, null, false], ["1100", "البنك", "ASSET", "1000", "BANK", false], ["1110", "الخزنة", "ASSET", "1000", "PETTY_CASH", false], ["1120", "خامات مستلمة من الجهات المالكة", "ASSET", "1000", "OWNER_MATERIALS", false], ["1130", "مخزون الخامات", "ASSET", "1000", "INVENTORY_ASSET", false], ["1200", "مديونيات الجهات المالكة", "ASSET", "1000", "OWNER_RECEIVABLE", false], ["1300", "سلف الموظفين", "ASSET", "1000", "EMPLOYEE_ADVANCES", false],
  ["2000", "الالتزامات", "LIABILITY", null, null, false], ["2100", "مستحقات مقاولي الباطن", "LIABILITY", "2000", "SUBCONTRACTOR_PAYABLE", false], ["2110", "تأمينات أعمال محتجزة", "LIABILITY", "2000", "RETENTION_PAYABLE", false], ["2120", "استقطاعات مقاولين", "LIABILITY", "2000", "SUBCONTRACTOR_DEDUCTIONS", false], ["2200", "رواتب مستحقة", "LIABILITY", "2000", "PAYROLL_PAYABLE", false], ["2210", "مستحقات الموردين", "LIABILITY", "2000", "SUPPLIER_PAYABLE", false],
  ["3000", "حقوق الملكية", "EQUITY", null, null, false], ["3100", "تمويلات المالك", "EQUITY", "3000", "OWNER_FUNDING", false], ["3200", "رصيد افتتاحي مرحّل", "EQUITY", "3000", "OPENING_BALANCE", false],
  ["4000", "الإيرادات", "REVENUE", null, null, false], ["4100", "إيراد أعمال المقاولات", "REVENUE", "4000", "CONTRACT_REVENUE", false],
  ["5000", "تكاليف ومصروفات المشروعات", "EXPENSE", null, null, false], ["5100", "تكلفة مقاولين باطن", "EXPENSE", "5000", "SUBCONTRACT_COST", false], ["5110", "تكلفة مواد مشروع", "EXPENSE", "5000", "PROJECT_MATERIAL_COST", false], ["5120", "تكلفة مشتريات مشروع", "EXPENSE", "5000", "PURCHASE_COST", false], ["5130", "تكلفة رواتب", "EXPENSE", "5000", "PAYROLL_COST", false], ["5200", "سولار", "EXPENSE", "5000", "DIESEL_EXPENSE", true], ["5210", "يوميات عمال", "EXPENSE", "5000", "DAILY_LABOR_EXPENSE", true], ["5220", "انتقالات", "EXPENSE", "5000", "TRANSPORT_EXPENSE", true], ["5230", "صيانة", "EXPENSE", "5000", "MAINTENANCE_EXPENSE", true], ["5240", "ضيافة", "EXPENSE", "5000", "HOSPITALITY_EXPENSE", true], ["5250", "أدوات ومهمات", "EXPENSE", "5000", "TOOLS_EXPENSE", true], ["5260", "إداريات مشروع", "EXPENSE", "5000", "PROJECT_ADMIN_EXPENSE", true], ["5270", "نثريات ومصروفات عمومية", "EXPENSE", "5000", "GENERAL_EXPENSE", true],
];

try {
  for (const [code, name, type, parentCode, systemKey, allowManualEntry] of chart) {
    const parent = parentCode ? await prisma.accountingAccount.findUnique({ where: { code: parentCode } }) : null;
    await prisma.accountingAccount.upsert({ where: { code }, update: { name, type, parentId: parent?.id || null, systemKey, allowManualEntry, active: true }, create: { code, name, type, parentId: parent?.id || null, systemKey, allowManualEntry } });
  }
  await prisma.bankAccount.upsert({ where: { name: "الحساب البنكي الرئيسي" }, update: { active: true }, create: { name: "الحساب البنكي الرئيسي" } });
  const permissions = [["accounting.view", "عرض المحاسبة", "accounting"], ["accounting.manage", "إدارة القيود والحسابات", "accounting"], ["bank.view", "عرض البنك", "bank"], ["bank.manage", "إدارة حركات البنك", "bank"]];
  for (const [key, name, module] of permissions) await prisma.permission.upsert({ where: { key }, update: { name, module }, create: { key, name, module } });
  const roles = await prisma.role.findMany({ where: { key: { in: ["admin", "accountant"] } } });
  const permissionRows = await prisma.permission.findMany({ where: { key: { in: permissions.map(([key]) => key) } } });
  for (const role of roles) for (const permission of permissionRows) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  console.log("Accounting chart and demo permissions are ready.");
} finally { await prisma.$disconnect(); }
