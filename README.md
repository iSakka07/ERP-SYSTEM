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

قبل تشغيله اضبط `DEMO_USER_PASSWORD` بكلمة مرور عرض قوية من 12 حرفًا على الأقل. لا تستخدم `db:demo-setup` على قاعدة تشغيل حقيقية.

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
pnpm test:financial-idempotency-api
pnpm test:isolated-api
```

`pnpm test:isolated-api` هو أمر القبول المعتمد: ينشئ قاعدة SQLite وخادمًا مؤقتين، يجهز بيانات العرض المطلوبة، يشغّل جميع اختبارات API، ثم يحذف البيئة المؤقتة. لا تشغّل اختبارات API المنفردة على قاعدة إنتاج.

## التشغيل الفعلي

```bash
pnpm install --frozen-lockfile
pnpm db:setup
pnpm verify:production-env
pnpm build
pnpm start --port 3090
```

بعد تشغيل الخادم افحص `GET /api/health` من مزود الاستضافة. يعيد `{ "status": "ok" }` فقط عند اتصال التطبيق بقاعدة البيانات، ولا يكشف أي بيانات مالية أو إعدادات.

قبل أي نشر فعلي:

- استخدم `AUTH_SECRET` قويًا ومختلفًا لكل بيئة.
- شغّل `pnpm verify:production-env` بملف بيئة النشر قبل البناء؛ لا يطبع أي سر لكنه يرفض الرابط غير الآمن أو قاعدة `dev.db` أو سرًا افتراضيًا.
- وفر تخزينًا دائمًا لملف SQLite ونسخًا احتياطيًا دوريًا مع تجربة الاستعادة.
- قبل أي migration على بيانات العمل شغّل `pnpm db:backup` ثم `pnpm db:verify-backup`. مشغل migrations يحفظ بصمة لكل migration ويوقف التشغيل إذا تغير ملف سبق تطبيقه، كما ينفذ كل migration داخل transaction واحدة؛ لكن النسخ والاستعادة تظل شرط تشغيل قبل أي ترحيل على بيانات العمل.
- لا تستخدم `db:demo-setup` أو حسابات العرض في التشغيل الحقيقي.
- شغل التطبيق خلف HTTPS واضبط الـproxy والكوكيز حسب بيئة النشر.
- في الإنتاج يرفض تسجيل الدخول إذا كان `AUTH_SECRET` قصيرًا/تجريبيًا، أو إذا كان `AUTH_URL` موجودًا وليس HTTPS.
- محاولات الدخول محدودة داخل عملية التطبيق حسب الحساب وعنوان IP؛ عند تشغيل أكثر من instance انقل مخزن الحدود إلى خدمة مشتركة.
- راجع [خطة معالجة V1](./V1_REMEDIATION_PLAN.md) قبل اعتبار النظام جاهزًا للاستخدام المالي الحقيقي.

دليل التشغيل والاستعادة وإعداد بيئة العرض موجود في [دليل تشغيل V1](./docs/operations/PRODUCTION_RUNBOOK.md). لا تعتبر أي قاعدة عرض أو جهاز تطوير بيئة إنتاج.

## مراجع الموديولات

- [العقود والوارد](./docs/modules/INCOMING-V1.md)
- [أعمال مقاولي الباطن](./docs/modules/EXPENSES-V1.md)
- [المحاسبة](./docs/modules/ACCOUNTINGmodule.md)
- [الصندوق والنثريات](./docs/modules/PETTYCASHmodule.md)
- [مرجع V1 المعتمد](./docs/PRODUCT_BIBLE_V1.md)
- [خطة استضافة وتسليم نسخة العميل](./docs/operations/CLIENT_HOSTING_CONTROL_PLAN.md)
- [تقرير مراجعة V1](./docs/audit-v1/AUDIT_V1.md)
- [دليل التشغيل والاستعادة](./docs/operations/PRODUCTION_RUNBOOK.md)

المرجع الوظيفي النهائي هو Product Bible الخاص بالمشروع. يجب إبقاء نسخة محدثة منه داخل المستودع قبل التسليم أو النشر.
