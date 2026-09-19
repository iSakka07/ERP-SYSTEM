import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    if (process.env.ERP_ALLOW_LEGACY_PETTY_CASH_UPGRADE !== 'true') throw new Error('التحويل التاريخي متوقف افتراضيًا. استخدم نسخة احتياطية واضبط ERP_ALLOW_LEGACY_PETTY_CASH_UPGRADE=true فقط بعد مراجعة البيانات.');
    const applied = await tx.$queryRawUnsafe('SELECT "name" FROM "_erp_migrations" WHERE "name" = ?', '20260916090000_petty_cash');
    if (applied.length) throw new Error('قاعدة البيانات مسجلة بالفعل كوحدة قروش ولا تقبل التحويل التاريخي مرة أخرى.');
    if (await tx.systemMetadata.findUnique({where:{key:'pettycash-cents-v2'}})) return;
    const transactions = await tx.pettyCashTransaction.findMany();
    const counts = await tx.pettyCashCount.findMany();
    // Preserve the pre-conversion monetary values for a reversible, one-time repair.
    await tx.systemMetadata.create({data:{key:'pettycash-cents-v2-backup',value:JSON.stringify({transactions:transactions.map(t=>({id:t.id,amountCents:t.amountCents})),counts})}});
    for (const t of transactions) await tx.pettyCashTransaction.update({where:{id:t.id},data:{amountCents:Math.round(t.amountCents*100)}});
    for (const c of counts) await tx.pettyCashCount.update({where:{id:c.id},data:{expectedCents:Math.round(c.expectedCents*100),actualCents:Math.round(c.actualCents*100),differenceCents:Math.round(c.differenceCents*100)}});
    await tx.systemMetadata.create({data:{key:'pettycash-cents-v2',value:new Date().toISOString()}});
    // The first version applied this SQL directly but omitted the local migration ledger.
    await tx.$executeRawUnsafe('INSERT OR IGNORE INTO "_erp_migrations" ("name") VALUES (?)','20260916090000_petty_cash');
    console.log(`Converted ${transactions.length} movements and ${counts.length} counts to integer cents; original values preserved.`);
  });
} finally {await db.$disconnect();}
