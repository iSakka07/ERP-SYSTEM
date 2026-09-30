import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const email = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.RESET_ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error("RESET_ADMIN_EMAIL and RESET_ADMIN_PASSWORD (minimum 12 characters) are required.");
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No user found for " + email);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(password, 12), active: true },
  });
  console.log("Password reset completed for " + email);
} finally {
  await prisma.$disconnect();
}
