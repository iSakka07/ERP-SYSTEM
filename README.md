# ERP-SYSTEM V1 — السلامة جروب

منظومة عربية لإدارة شركة مقاولات، مبنية بـ Next.js وPrisma وSQLite. النسخة الحالية تشمل إدارة الجهات والمشروعات، العقود والوارد، أعمال ومستخلصات مقاولي الباطن، المشتريات، المرتبات، Petty Cash، البنك، تكلفة المشروعات، المحاسبة والقيود، وتقارير PDF بهوية الشركة.

## المتطلبات

- Node.js حديث متوافق مع Next.js 16.
- pnpm 11.
- مساحة تخزين دائمة لقاعدة SQLite؛ المرفقات محفوظة داخل قاعدة البيانات حاليًا.

## تشغيل نسخة جديدة

```bash
pnpm install --frozen-lockfile
pnpm db:setup
pnpm dev --port 3090
```

`db:setup` ينشئ Prisma Client، يشغل migrations، يضيف المستخدمين والبيانات الأساسية، ثم يجهز دليل الحسابات والحساب البنكي وصلاحيات المحاسبة والبنك. لا تشغل `db:seed` منفردًا كبديل لتجهيز نسخة جديدة.

اضبط القيم التالية في ملف بيئة محلي غير متتبع:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="ضع-سرًا-طويلًا-وعشوائيًا"
BOOTSTRAP_ADMIN_NAME="اسم مدير النظام"
BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
BOOTSTRAP_ADMIN_PASSWORD="كلمة-مرور-قوية-وفريدة"
```

في أول تشغيل فقط، ينشئ `db:setup` مدير النظام من قيم `BOOTSTRAP_ADMIN_*`. إذا كانت قاعدة البيانات تحتوي مستخدمين فلن يغيّر كلمات مرورهم أو أدوارهم. بيانات العرض التجريبية لها أمر صريح ومنفصل:

```bash
pnpm db:demo-setup
```

لا تستخدم `db:demo-setup` على قاعدة تشغيل حقيقية.

## فحوصات التطوير

```bash
pnpm lint
pnpm build
pnpm test:incoming
pnpm test:expenses
pnpm test:petty-cash
pnpm test:salaries
pnpm test:project-cost-control
pnpm test:login-rate-limit
```

اختبارات API تستخدم افتراضيًا `http://localhost:3090` وقد تنشئ بيانات اختبار مؤقتة. لا تشغلها على قاعدة إنتاج. يمكن تحديد خادم اختبار صراحة عبر `ERP_TEST_URL`.

## التشغيل الفعلي

```bash
pnpm install --frozen-lockfile
pnpm db:setup
pnpm build
pnpm start --port 3090
```

قبل أي نشر فعلي:

- استخدم `AUTH_SECRET` قويًا ومختلفًا لكل بيئة.
- وفر تخزينًا دائمًا لملف SQLite ونسخًا احتياطيًا دوريًا مع تجربة الاستعادة.
- شغل migrations على نسخة احتياطية أولًا، لأن مشغل migrations الحالي ليس ذريًا على مستوى ملف migration كامل.
- لا تستخدم `db:demo-setup` أو حسابات العرض في التشغيل الحقيقي.
- شغل التطبيق خلف HTTPS واضبط الـproxy والكوكيز حسب بيئة النشر.
- محاولات الدخول محدودة داخل عملية التطبيق حسب الحساب وعنوان IP؛ عند تشغيل أكثر من instance انقل مخزن الحدود إلى خدمة مشتركة.
- راجع [خطة معالجة V1](./V1_REMEDIATION_PLAN.md) قبل اعتبار النظام جاهزًا للاستخدام المالي الحقيقي.

## مراجع الموديولات

- [العقود والوارد](./INCOMING-V1.md)
- [أعمال مقاولي الباطن](./EXPENSES-V1.md)
- [المحاسبة](./ACCOUNTINGmodule.md)
- [تقرير مراجعة V1](./docs/audit-v1/AUDIT_V1.md)

المرجع الوظيفي النهائي هو Product Bible الخاص بالمشروع. يجب إبقاء نسخة محدثة منه داخل المستودع قبل التسليم أو النشر.
