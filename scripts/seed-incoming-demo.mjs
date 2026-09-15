import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
function demoPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream =
    "BT /F1 18 Tf 30 130 Td (ERP V1 - DEMO ONLY) Tj 0 -35 Td (Not a real financial document) Tj ET";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
try {
  const project = await db.project.findUniqueOrThrow({
    where: { code: "MAYAN-27" },
  });
  const actor = await db.user.findUniqueOrThrow({
    where: { email: "admin@erp.local" },
  });
  if (
    await db.incomingContract.findUnique({ where: { number: "DEMO-IN-001" } })
  )
    console.log("Incoming demo exists; existing data unchanged.");
  else
    await db.$transaction(async (tx) => {
      const c = await tx.incomingContract.create({
        data: {
          number: "DEMO-IN-001",
          name: "عقد عمارة 27 — مثال تجريبي",
          projectId: project.id,
          originalCents: 1_000_000_000,
          notes: "بيانات تجريبية فقط لتوضيح المستخلصات التراكمية والخامات.",
        },
      });
      const one = await tx.incomingStatement.create({
        data: {
          contractId: c.id,
          sequence: 1,
          grossCents: 100_000_000,
          stage: "PAID",
          paidAt: new Date("2026-09-15"),
          paymentMethod: "TRANSFER",
          paymentReference: "DEMO-TRANSFER-001",
        },
      });
      const two = await tx.incomingStatement.create({
        data: {
          contractId: c.id,
          sequence: 2,
          grossCents: 160_000_000,
          stage: "CENTRAL",
        },
      });
      const mat1 = await tx.materialCertificate.create({
        data: {
          number: "DEMO-MAT-001",
          statementId: one.id,
          totalCents: 10_000_000,
          items: {
            create: [
              {
                name: "حديد تسليح — مثال",
                unit: "طن",
                quantity: 5,
                unitPriceCents: 2_000_000,
                totalCents: 10_000_000,
              },
            ],
          },
        },
      });
      const mat2 = await tx.materialCertificate.create({
        data: {
          number: "DEMO-MAT-002",
          statementId: two.id,
          totalCents: 5_000_000,
          items: {
            create: [
              {
                name: "أسمنت — مثال",
                unit: "طن",
                quantity: 10,
                unitPriceCents: 500_000,
                totalCents: 5_000_000,
              },
            ],
          },
        },
      });
      const data = demoPdf();
      for (const [entityType, entityId] of [
        ["contract", c.id],
        ["statement", one.id],
        ["statement", two.id],
        ["material", mat1.id],
        ["material", mat2.id],
      ])
        await tx.incomingAttachment.create({
          data: {
            entityType,
            entityId,
            name: "DEMO-ONLY.pdf",
            mime: "application/octet-stream",
            size: data.length,
            data,
            actorId: actor.id,
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "incoming.demo.seed",
          target: c.id,
          details:
            "Explicitly labelled demo records; not client financial data.",
        },
      });
      console.log(
        "Incoming demo ready: 1m gross, 900k net; Jari 2 pending at Central.",
      );
    });
} finally {
  await db.$disconnect();
}
