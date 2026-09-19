import { mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const root = process.cwd();
const temp = await mkdtemp(resolve(root, "tmp", "isolated-test-"));
const port = String(3200 + Math.floor(Math.random() * 400));
const databaseUrl = `file:${resolve(temp, "test.db").replaceAll("\\", "/")}`;
const testUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: "isolated-test-secret-with-at-least-32-characters", AUTH_URL: testUrl, ERP_ISOLATED_TEST: "true", BOOTSTRAP_ADMIN_EMAIL: "admin@erp.local", BOOTSTRAP_ADMIN_PASSWORD: "Admin@123456", BOOTSTRAP_ADMIN_NAME: "مدير النظام", ERP_TEST_URL: testUrl };
const run = (args) => {
  const result = spawnSync("pnpm", args, { cwd: root, env, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error(`فشل الأمر المعزول: pnpm ${args.join(" ")}`);
};

let server;
try {
  // Prisma Client مُولّد مسبقًا ضمن build؛ عدم توليده هنا يمنع قفل DLL على Windows
  // ولا يغير قاعدة العرض أو ملفات التشغيل.
  run(["db:migrate"]); run(["db:seed-demo"]); run(["db:demo-incoming"]); run(["db:demo-expenses"]); run(["db:accounting-setup"]); run(["build"]);
  server = spawn("cmd.exe", ["/c", `pnpm exec next start -p ${port}`], { cwd: root, env, stdio: "pipe", shell: false });
  server.stderr.on("data", (value) => process.stderr.write(value));
  server.stdout.on("data", (value) => process.stdout.write(value));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${env.ERP_TEST_URL}/login`); if (response.status < 500) break; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (Date.now() >= deadline) throw new Error("لم يبدأ خادم الاختبارات المعزول.");
  for (const command of ["test:login-rate-limit", "test:incoming-api", "test:expenses-api", "test:expense-corrections-api", "test:purchases-api", "test:petty-cash-api", "test:financial-idempotency-api", "test:project-cost-control-api"]) run([command]);
  console.log("PASS: كل اختبارات API شُغلت على قاعدة وخادم معزولين.");
} finally {
  if (server?.pid) { spawnSync("taskkill.exe", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" }); await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 2_000))]); }
  for (let attempt = 0; attempt < 5; attempt += 1) { try { await rm(temp, { recursive: true, force: true }); break; } catch (error) { if (attempt === 4) throw error; await new Promise((resolveWait) => setTimeout(resolveWait, 500)); } }
}
