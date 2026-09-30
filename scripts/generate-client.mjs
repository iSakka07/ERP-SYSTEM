import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const raw = process.env.DATABASE_URL || "";
const schema = /^postgres(?:ql)?:\/\//i.test(raw)
  ? resolve(root, "prisma/postgresql/schema.prisma")
  : resolve(root, "prisma/schema.prisma");
const cli = resolve(root, "node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [cli, "generate", "--schema", schema], { cwd: root, env: process.env, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
