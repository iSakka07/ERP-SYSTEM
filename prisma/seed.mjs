import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const demoMode = process.env.ERP_SEED_DEMO === "true";
const permissions = [
  ["dashboard.view", "عرض لوحة الإدارة", "dashboard"],
  ["incoming.view", "عرض الوارد", "incoming"], ["incoming.manage", "إدارة الوارد", "incoming"],
  ["expenses.view", "عرض مستخلصات المقاولين", "expenses"], ["expenses.manage", "إدارة مستخلصات المقاولين", "expenses"],
  ["expenses.approve_technical", "اعتماد حصر المكتب الفني", "expenses"],
  ["expenses.approve_site", "اعتماد مهندس الموقع", "expenses"],
  ["expenses.approve_executive", "اعتماد المدير التنفيذي", "expenses"],
  ["expenses.pay", "استلام الحسابات وتسجيل دفعات المقاولين", "expenses"],
  ["expenses.return", "رد مستخلص للمراجعة", "expenses"],
  ["purchases.view", "عرض المشتريات", "purchases"], ["purchases.manage", "إدارة المشتريات", "purchases"],
  ["salaries.view", "عرض المرتبات", "salaries"], ["salaries.manage", "إدارة المرتبات", "salaries"],
  ["treasury.view", "عرض الخزنة", "treasury"], ["treasury.manage", "إدارة الخزنة", "treasury"],
  ["pettycash.view", "عرض Petty Cash", "pettycash"], ["pettycash.manage", "إدارة Petty Cash", "pettycash"],
  ["project_cost_control.view", "عرض موقف تكلفة المشروع", "project_cost_control"],
  ["accounting.view", "عرض المحاسبة", "accounting"], ["accounting.manage", "إدارة القيود والحسابات", "accounting"],
  ["accounts.manage", "إدارة الحسابات والصلاحيات", "accounts"],
  ["masterdata.view", "عرض البيانات الأساسية", "masterdata"], ["masterdata.manage", "إدارة البيانات الأساسية", "masterdata"],
];

const roles = [["admin", "مدير النظام"], ["executive_director", "المدير التنفيذي"], ["accountant", "محاسب"], ["technical_office_engineer", "مهندس مكتب فني"], ["site_supervisor_engineer", "مهندس مشرف"], ["storekeeper", "أمين مخزن"], ["sales", "مبيعات"]];
const grants = /** @type {Record<string, string[]>} */ ({
  admin: permissions.map(([key]) => key),
  executive_director: permissions.map(([key]) => key).filter((key) => key !== "accounts.manage"),
  accountant: permissions.map(([key]) => key).filter((key) => key !== "accounts.manage" && key !== "masterdata.manage" && !key.startsWith("expenses.approve_") && key !== "expenses.return"),
  technical_office_engineer: ["dashboard.view", "masterdata.view", "expenses.view", "expenses.manage", "expenses.approve_technical", "purchases.view"],
  site_supervisor_engineer: ["dashboard.view", "masterdata.view", "expenses.view", "expenses.approve_site"],
  storekeeper: ["dashboard.view", "purchases.view", "purchases.manage", "masterdata.view"],
  sales: ["dashboard.view"],
});

try {
  for (const [key, name, module] of permissions) {
    await prisma.permission.upsert({ where: { key }, update: { name, module }, create: { key, name, module } });
  }
  for (const [key, name] of roles) {
    const role = await prisma.role.upsert({ where: { key }, update: { name }, create: { key, name } });
    const allowed = await prisma.permission.findMany({ where: { key: { in: grants[key] } } });
    for (const permission of allowed) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }

  if (demoMode) {
    const demoPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoPassword || demoPassword.length < 12 || demoPassword === "Admin@123456")
      throw new Error("تجهيز بيانات العرض يحتاج DEMO_USER_PASSWORD آمنة من 12 حرفًا على الأقل وغير مساوية لكلمة المرور القديمة.");
    const passwordHash = await hash(demoPassword, 12);
    const seededUsers = [
      ["مدير النظام", "admin@erp.local", "admin"], ["المحاسب التجريبي", "accountant@erp.local", "accountant"],
      ["أمين المخزن التجريبي", "storekeeper@erp.local", "storekeeper"], ["مستخدم المبيعات التجريبي", "sales@erp.local", "sales"],
    ];
    for (const [name, email, roleKey] of seededUsers) {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
      await prisma.user.upsert({
        where: { email },
        update: { name, passwordHash, roleId: role.id, active: true },
        create: { name, email, passwordHash, roleId: role.id },
      });
    }
    const company = await prisma.company.upsert({ where: { name: "إدارة الأشغال العسكرية" }, update: { active: true }, create: { name: "إدارة الأشغال العسكرية", type: "OWNER" } });
    const project = await prisma.project.upsert({ where: { code: "MAYAN-27" }, update: { companyId: company.id }, create: { code: "MAYAN-27", name: "عمارة 27 - كمبوند مايان", companyId: company.id } });
    await prisma.company.upsert({ where: { name: "مورد خامات تجريبي" }, update: { type: "SUPPLIER", active: true }, create: { name: "مورد خامات تجريبي", type: "SUPPLIER", phone: "01000000000" } });
    const engineer = await prisma.employee.upsert({ where: { employeeCode: "ENG-001" }, update: { active: true }, create: { employeeCode: "ENG-001", name: "أحمد محمد", jobTitle: "مهندس موقع" } });
    const assignment = await prisma.projectEngineerAssignment.findFirst({ where: { projectId: project.id, employeeId: engineer.id, active: true } });
    if (!assignment) await prisma.projectEngineerAssignment.create({ data: { projectId: project.id, employeeId: engineer.id } });
  } else if (!(await prisma.user.count())) {
    const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!name || !email || !email.includes("@") || !password || password.length < 12 || password === "Admin@123456") throw new Error("أول تشغيل يحتاج BOOTSTRAP_ADMIN_NAME وBOOTSTRAP_ADMIN_EMAIL وكلمة BOOTSTRAP_ADMIN_PASSWORD آمنة من 12 حرفًا على الأقل.");
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
    await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 12), roleId: role.id } });
  }
  await prisma.pettyCashAccount.upsert({ where: { id: "petty-main" }, update: { name: "الخزنة الرئيسية", active: true, type: "MAIN" }, create: { id: "petty-main", name: "الخزنة الرئيسية", type: "MAIN" } });
  const categories = [["workers_daily", "يوميات عمال"], ["project_admin", "إداريات مشروع"], ["transport", "انتقالات"], ["diesel", "سولار"], ["maintenance", "صيانة"], ["hospitality", "ضيافة"], ["small_purchases", "مشتريات صغيرة"], ["tools", "أدوات ومهمات"], ["petty", "نثريات"], ["general", "مصروفات عمومية"], ["other", "أخرى"]];
  for (const [key, name] of categories) await prisma.pettyCashCategory.upsert({ where: { key }, update: { name, active: true }, create: { key, name, requiresAttachment: true } });
  console.log(demoMode ? "Demo roles, users and master data are ready." : "Base roles, permissions and secure administrator bootstrap are ready.");
} finally {
  await prisma.$disconnect();
}
