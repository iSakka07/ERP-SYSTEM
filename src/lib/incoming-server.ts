import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function incomingUser(permission: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (
    !user?.active ||
    !user.role?.permissions.some((p) => p.permission.key === permission)
  )
    return null;
  return { id: user.id, admin: user.role.key === "admin" };
}

export async function readIncomingFiles(form: FormData) {
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (
    files.length > 5 ||
    files.reduce((s, f) => s + f.size, 0) > 10 * 1024 * 1024
  )
    throw new Error("الحد الأقصى 5 مرفقات بإجمالي 10 ميجابايت.");
  return Promise.all(
    files.map(async (f) => {
      const data = Buffer.from(await f.arrayBuffer());
      const ext = f.name.split(".").at(-1)?.toLowerCase();
      const sig = data.subarray(0, 8).toString("hex");
      const valid =
        ext === "pdf"
          ? data.subarray(0, 5).toString() === "%PDF-"
          : ["png"].includes(ext ?? "")
            ? sig === "89504e470d0a1a0a"
            : ["jpg", "jpeg"].includes(ext ?? "")
              ? sig.startsWith("ffd8ff")
              : ext === "webp"
                ? data.subarray(0, 4).toString() === "RIFF" &&
                  data.subarray(8, 12).toString() === "WEBP"
                : ext === "xlsx"
                  ? sig.startsWith("504b0304")
                  : ext === "xls" && sig === "d0cf11e0a1b11ae1";
      if (!valid)
        throw new Error(
          "المرفقات المقبولة: PDF أو Excel أو صور PNG/JPG/WebP سليمة.",
        );
      return {
        name: f.name.slice(0, 200),
        mime: "application/octet-stream",
        size: f.size,
        data,
      };
    }),
  );
}
