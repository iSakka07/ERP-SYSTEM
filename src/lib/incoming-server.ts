import "server-only";
import type { Prisma } from "@prisma/client";
import { requireAccess } from "@/lib/server-access";
import { postOwnerMaterialCertificate } from "@/lib/accounting-posting";

type Tx = Prisma.TransactionClient;

export type MaterialCertificateContract = {
  projectId: string;
  project: { companyId: string };
  statements: {
    id: string;
    sequence: number;
    grossCents: number;
    materials: { id: string; totalCents: number }[];
  }[];
};

export async function assertMaterialCertificateTotals(
  contract: MaterialCertificateContract,
  statement: { id: string; sequence: number },
  totalCents: number,
  excludeCertificateId?: string,
) {
  for (const later of contract.statements.filter((x) => x.sequence >= statement.sequence)) {
    const cumulative =
      contract.statements
        .filter((x) => x.sequence <= later.sequence)
        .reduce(
          (n, x) =>
            n +
            x.materials
              .filter((m) => m.id !== excludeCertificateId)
              .reduce((a, m) => a + m.totalCents, 0),
          0,
        ) + totalCents;
    if (cumulative > later.grossCents)
      throw new Error(
        "إجمالي الخامات التراكمية يتجاوز المستخلص الحالي أو أحد المستخلصات اللاحقة.",
      );
  }
}

export async function createMaterialCertificate(
  tx: Tx,
  input: {
    number: string;
    notes?: string | null;
    items: { name: string; unit: string; quantity: number; unitPriceCents: number; totalCents: number }[];
    totalCents: number;
  },
  context: {
    statementId: string;
    contract: MaterialCertificateContract;
    statement: { id: string; sequence: number };
  },
  actorId: string,
) {
  await assertMaterialCertificateTotals(context.contract, context.statement, input.totalCents);
  const created = await tx.materialCertificate.create({
    data: {
      number: input.number,
      notes: input.notes || null,
      totalCents: input.totalCents,
      statementId: context.statementId,
      items: { create: input.items },
    },
  });
  await postOwnerMaterialCertificate(
    tx,
    { ...created, statement: { contract: { projectId: context.contract.projectId } } },
    context.contract.project.companyId,
    actorId,
  );
  return created;
}

export async function incomingUser(permission: string) {
  return requireAccess(permission);
}

export async function readIncomingFiles(
  form: FormData,
  field = "files",
  limits: { maxFileBytes?: number; maxTotalBytes?: number } = {},
) {
  const files = form
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
  const labels = form.getAll(`${field}Labels`).map((value) => String(value).trim());
  if (files.length && (labels.length !== files.length || labels.some((label) => !label || label.length > 160)))
    throw new Error("اكتب وصفًا واضحًا لكل مرفق.");
  const maxFileBytes = limits.maxFileBytes ?? 5 * 1024 * 1024;
  const maxTotalBytes = limits.maxTotalBytes ?? 10 * 1024 * 1024;
  if (
    files.length > 5 ||
    files.some((file) => file.size > maxFileBytes) ||
    files.reduce((s, f) => s + f.size, 0) > maxTotalBytes
  )
    throw new Error(`الحد الأقصى 5 مرفقات بإجمالي ${Math.round(maxTotalBytes / 1024 / 1024)} ميجابايت.`);
  return Promise.all(
    files.map(async (f, index) => {
      const data = Buffer.from(await f.arrayBuffer());
      if (data.length !== f.size || data.length > maxFileBytes)
        throw new Error("حجم أحد المرفقات غير مسموح به.");
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
        label: labels[index],
        mime: "application/octet-stream",
        size: f.size,
        data,
      };
    }),
  );
}
