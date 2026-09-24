import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const tempRoot = resolve(root, "tmp");
await mkdir(tempRoot, { recursive: true });
const temp = await mkdtemp(resolve(tempRoot, "isolated-test-"));
const port = String(3200 + Math.floor(Math.random() * 400));
const databaseUrl = `file:${resolve(temp, "test.db").replaceAll("\\", "/")}`;
const testUrl = `http://127.0.0.1:${port}`;
const adminPassword = "IsolatedDemo@123456";
const env = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: "isolated-test-secret-with-at-least-32-characters", AUTH_URL: testUrl, ERP_ISOLATED_TEST: "true", BOOTSTRAP_ADMIN_EMAIL: "admin@erp.local", BOOTSTRAP_ADMIN_PASSWORD: adminPassword, DEMO_USER_PASSWORD: adminPassword, ERP_TEST_ADMIN_PASSWORD: adminPassword, BOOTSTRAP_ADMIN_NAME: "مدير النظام", ERP_TEST_URL: testUrl };
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const apiTests = ["test:login-rate-limit", "test:incoming-api", "test:expenses-api", "test:expense-corrections-api", "test:purchases-api", "test:warehouse-receipts-api", "test:petty-cash-api", "test:financial-idempotency-api", "test:project-cost-control-api"];
const selectedTest = process.env.ERP_TEST_ONLY;
if (selectedTest && !apiTests.includes(selectedTest)) throw new Error(`اختبار العزل غير معروف: ${selectedTest}`);
const windowsPnpm = process.platform === "win32" ? (() => {
  const located = spawnSync("where.exe", ["pnpm.cmd"], { encoding: "utf8" });
  const command = located.stdout.split(/\r?\n/).find(Boolean);
  if (!command) throw new Error("تعذر العثور على pnpm لتشغيل اختبار العزل.");
  const fallback = resolve(dirname(command), "..", "..", "node");
  return { executable: resolve(fallback, "bin", "node.exe"), entry: resolve(fallback, "node_modules", "pnpm", "bin", "pnpm.mjs") };
})() : null;
const run = (args) => {
  const result = windowsPnpm
    ? spawnSync(windowsPnpm.executable, [windowsPnpm.entry, ...args], { cwd: root, env, stdio: "inherit", shell: false })
    : spawnSync(pnpm, args, { cwd: root, env, stdio: "inherit", shell: false });
  if (result.status !== 0) throw new Error(`فشل الأمر المعزول: pnpm ${args.join(" ")}`);
};

let server;
try {
  // Prisma Client مُولّد مسبقًا ضمن build؛ عدم توليده هنا يمنع قفل DLL على Windows
  // ولا يغير قاعدة العرض أو ملفات التشغيل.
  run(["db:migrate"]); run(["db:seed-demo"]); run(["db:demo-incoming"]); run(["db:demo-expenses"]); run(["db:accounting-setup"]); run(["build"]);
  server = windowsPnpm
    ? spawn(windowsPnpm.executable, [windowsPnpm.entry, "exec", "next", "start", "-p", port], { cwd: root, env, stdio: "pipe", shell: false })
    : spawn(pnpm, ["exec", "next", "start", "-p", port], { cwd: root, env, stdio: "pipe", shell: false });
  server.stderr.on("data", (value) => process.stderr.write(value));
  server.stdout.on("data", (value) => process.stdout.write(value));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${env.ERP_TEST_URL}/login`); if (response.status < 500) break; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (Date.now() >= deadline) throw new Error("لم يبدأ خادم الاختبارات المعزول.");
  for (const command of selectedTest ? [selectedTest] : apiTests) run([command]);
  console.log(selectedTest ? `PASS: ${selectedTest} شُغل على قاعدة وخادم معزولين.` : "PASS: كل اختبارات API شُغلت على قاعدة وخادم معزولين.");
} finally {
  if (server?.pid) {
    if (process.platform === "win32") spawnSync("taskkill.exe", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    else server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 2_000))]);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) { try { await rm(temp, { recursive: true, force: true }); break; } catch (error) { if (attempt === 4) throw error; await new Promise((resolveWait) => setTimeout(resolveWait, 500)); } }
}
