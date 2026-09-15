import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const email = "admin@erp.local";

try {
  const passwordHash = await hash("Admin@123456", 12);
  await prisma.user.upsert({
    where: { email },
    update: { name: "مدير النظام", passwordHash, active: true },
    create: { name: "مدير النظام", email, passwordHash },
  });
  console.log(`Demo admin is ready: ${email}`);
} finally {
  await prisma.$disconnect();
}
