import { PrismaClient } from "@prisma/client";
import { calculateExpense } from "../src/lib/expenses.ts";
const db = new PrismaClient();
try {
  if (
    await db.subcontractAccount.findFirst({
      where: { name: "نقاشة عمارة 27 — مثال تجريبي" },
    })
  ) {
    console.log("Expenses demo exists; no existing data changed.");
  } else {
    const actor = await db.user.findUniqueOrThrow({
      where: { email: "admin@erp.local" },
    });
    const project = await db.project.findUniqueOrThrow({
      where: { code: "MAYAN-27" },
    });
    const company = await db.company.upsert({
      where: { name: "شركة التمساح" },
      update: {},
      create: { name: "شركة التمساح", type: "SUBCONTRACTOR" },
    });
    const proof = await db.incomingAttachment.findFirstOrThrow({
      where: { name: "DEMO-ONLY.pdf" },
    });
    await db.$transaction(async (tx) => {
      const account = await tx.subcontractAccount.create({
        data: {
          name: "نقاشة عمارة 27 — مثال تجريبي",
          companyId: company.id,
          projectId: project.id,
          scope: "عمارة 27 — نقاشة",
          notes: "بيانات تجريبية فقط، وليست حسابات العميل الفعلية.",
        },
      });
      const oneCalc = calculateExpense(
        [
          {
            itemKey: "DEMO-PAINT",
            name: "نقاشة الدور الأرضي",
            unit: "م2",
            currentQuantity: 200,
            price: 400,
            entitlementPercent: 65,
          },
        ],
        [{ name: "تأمين أعمال", kind: "PERCENT", value: 5 }],
      );
      const twoCalc = calculateExpense(
        [
          {
            itemKey: "DEMO-PAINT",
            name: "نقاشة الدور الأرضي",
            unit: "م2",
            currentQuantity: 100,
            price: 400,
            entitlementPercent: 100,
          },
        ],
        [{ name: "تأمين أعمال", kind: "PERCENT", value: 5 }],
        oneCalc.items,
      );
      const docs = [["account", account.id]];
      for (const [sequence, calc, stage] of [
        [1, oneCalc, "ACCOUNTING"],
        [2, twoCalc, "DRAFT"],
      ]) {
        const st = await tx.subcontractStatement.create({
          data: {
            accountId: account.id,
            sequence,
            stage,
            statementDate: new Date("2026-09-15"),
            notes: "مثال تجريبي فقط",
            grossCents: calc.grossCents,
            deductionCents: calc.deductionCents,
            netCents: calc.netCents,
            previousGrossCents: calc.previousGrossCents,
            executiveApprovedAt: sequence === 1 ? new Date() : null,
          },
        });
        docs.push(["statement", st.id]);
        for (const i of calc.items) {
          const { price, ...row } = i;
          void price;
          await tx.subcontractItem.create({
            data: { ...row, statementId: st.id },
          });
        }
        for (const d of calc.deductions)
          await tx.subcontractDeduction.create({
            data: { ...d, statementId: st.id },
          });
        if (sequence === 1) {
          for (const [fromStage, toStage] of [
            ["DRAFT", "TECHNICAL"],
            ["TECHNICAL", "SITE"],
            ["SITE", "EXECUTIVE"],
            ["EXECUTIVE", "ACCOUNTING"],
          ])
            await tx.subcontractApproval.create({
              data: {
                statementId: st.id,
                fromStage,
                toStage,
                actorId: actor.id,
                actorName: "اعتماد تجريبي فقط",
                revision: 1,
              },
            });
          const pay = await tx.subcontractPayment.create({
            data: {
              statementId: st.id,
              amountCents: 3000000,
              method: "TRANSFER",
              paymentDate: new Date("2026-09-15"),
              reference: "DEMO-PAY-001",
              notes: "دفعة تجريبية فقط",
              actorId: actor.id,
            },
          });
          docs.push(["payment", pay.id]);
        }
      }
      for (const [entityType, entityId] of docs)
        await tx.expenseAttachment.create({
          data: {
            entityType,
            entityId,
            name: "DEMO-ONLY.pdf",
            mime: "application/octet-stream",
            size: proof.size,
            data: proof.data,
            actorId: actor.id,
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "expenses.demo.seed",
          target: account.id,
          details:
            "Explicitly labelled demonstration, not client financial data.",
        },
      });
    });
    console.log(
      "Expenses demo ready: Jari1 approved52000, paid30000; Jari2 draft120000.",
    );
  }
} finally {
  await db.$disconnect();
}
