import { NextResponse } from "next/server";
import { incomingUser } from "@/lib/incoming-server";
import { parseReceiptFilters, receiptFilterSummary, receiptRegister } from "@/lib/warehouse-receipts";

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await incomingUser("warehouse.view");
  if (!user) return NextResponse.json({ error: "غير مصرح بعرض سجل الاستلام." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  try {
    const params = new URL(request.url).searchParams;
    const filters = parseReceiptFilters(params);
    const result = await receiptRegister(filters, { projectIds: user.isProjectScoped ? user.projectIds : undefined, all: params.get("format") === "csv" });

    if (params.get("format") === "csv") {
      if (result.total > 10_000) return NextResponse.json({ error: "نتائج التصدير كبيرة. ضيّق الفلاتر إلى 10,000 استلام أو أقل." }, { status: 422 });
      const headings = ["رقم الاستلام", "تاريخ الاستلام", "فاتورة المشتريات", "المورد", "النوع", "المخزن المستلم", "المشروع", "الحالة", "عدد البنود", "المنفذ", "تاريخ الإنشاء"];
      const rows = result.rows.map((row) => [row.number, row.movementDate.slice(0, 10), row.invoice?.number, row.supplier?.name, row.type === "DIRECT_PROJECT" ? "استلام مباشر للمشروع" : row.type === "WAREHOUSE" ? "استلام مخزني" : "استلام آخر", row.warehouse?.name, row.project?.name, `${row.status} · ${row.state}`, row.itemCount, row.creator, row.createdAt.slice(0, 10)]);
      const content = `# سياق الفلاتر: ${receiptFilterSummary(filters)}\r\n${[headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      return new Response(`\uFEFF${content}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''inventory-receipts.csv", "Cache-Control": "no-store" } });
    }

    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل سجل الاستلام." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
