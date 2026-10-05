"use client";

import { useState, type FormEvent } from "react";
import { Building2, Landmark, Paperclip, Plus, ReceiptText, X } from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { KpiCard, MoneyValue } from "@/components/erp-ui";
import { useConfirm } from "@/components/confirm-provider";
import { bankCategories, bankTypes } from "@/lib/bank";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import {
  confirmSimilarFinancialOperation,
  financialHeaders,
  financialResult,
} from "@/lib/financial-submit";
import {
  pdfColumns,
  pdfMoney,
  previewDataPdf,
  usePdfDataExport,
} from "@/components/pdf-data-export";
import type { BankData } from "@/lib/bank-data";

type Data = BankData;
const today = () => new Date().toISOString().slice(0, 10);
export function BankCenter({ initialData }: { initialData: BankData }) {
  const confirm = useConfirm();
  const [data, setData] = useState<Data>(initialData),
    [type, setType] = useState("OWNER_FUNDING"),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reverseId, setReverseId] = useState<string | null>(null);
  const load = async () => {
    const response = await fetch("/api/bank");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "تعذر تحميل البنك.");
    setData(body);
  };
  usePdfDataExport(() => {
    if (!data) return;
    const incomingTypes = [
      "OWNER_FUNDING",
      "MANUAL_DEPOSIT",
      "INCOMING_COLLECTION",
      "OPENING_BALANCE",
    ];
    const inflow = data.transactions
      .filter(
        (item) => item.status === "POSTED" && incomingTypes.includes(item.type),
      )
      .reduce((sum, item) => sum + item.amountCents, 0);
    const outflow = data.transactions
      .filter(
        (item) =>
          item.status === "POSTED" &&
          ["MANUAL_EXPENSE", "INCOMING_COLLECTION_REVERSAL"].includes(
            item.type,
          ),
      )
      .reduce((sum, item) => sum + item.amountCents, 0);
    void previewDataPdf({
      title: `دفتر البنك — ${data.account?.name || "الحساب الرئيسي"}`,
      kpis: [
        {
          label: "رصيد البنك الحالي",
          value: pdfMoney(data.balanceCents),
          tone: "blue",
        },
        { label: "إجمالي الوارد", value: pdfMoney(inflow), tone: "emerald" },
        { label: "إجمالي المنصرف", value: pdfMoney(outflow), tone: "amber" },
      ],
      tables: [
        {
          columns: pdfColumns(
            ["التاريخ", 2],
            ["النوع", 2],
            ["البيان", 3],
            ["المشروع / العام", 2],
            ["وارد", 2],
            ["منصرف", 2],
          ),
          rows: data.transactions
            .slice()
            .reverse()
            .map((item) => [
              item.transactionDate.slice(0, 10),
              bankTypes[item.type as keyof typeof bankTypes] || item.type,
              `${item.description}${item.reference ? ` · ${item.reference}` : ""}`,
              item.project?.name || "عام الشركة",
              incomingTypes.includes(item.type)
                ? pdfMoney(item.amountCents)
                : "—",
              incomingTypes.includes(item.type)
                ? "—"
                : pdfMoney(item.amountCents),
            ]),
        },
      ],
    });
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget,
      payload = Object.fromEntries(new FormData(form).entries()),
      scope = "bank-new";
    const send = async (): Promise<void> => {
      const body = new FormData(form);
      body.set("payload", JSON.stringify(payload));
      try {
        const result = await financialResult(
          await fetch("/api/bank", {
            method: "POST",
            body,
            headers: financialHeaders(scope),
          }),
          scope,
        );
        await load();
        setOpen(false);
        if (result.replayed) setError("العملية مسجلة بالفعل ولم تتكرر.");
      } catch (reason) {
        const similar = (
          reason as {
            similarFinancialOperation?: { confirmationToken: string };
          }
        ).similarFinancialOperation;
        if (
          similar &&
          await confirm({ title: "حركة مالية مشابهة", description: "توجد حركة مالية مشابهة مسجلة من قبل. هل تريد إنشاءها كعملية مستقلة؟", tone: "warning" })
        ) {
          confirmSimilarFinancialOperation(scope, similar.confirmationToken);
          return send();
        }
        throw reason;
      }
    };
    try {
      await send();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reverseId) return; setBusy(true); setError("");
    try { const form = event.currentTarget; const body = new FormData(form); const payload = { action: "reverse", id: reverseId, reason: String(body.get("reason") || "") }; body.set("payload", JSON.stringify(payload)); await financialResult(await fetch("/api/bank", { method: "POST", body, headers: financialHeaders(`bank-reverse-${reverseId}`) }), `bank-reverse-${reverseId}`); await load(); setReverseId(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إلغاء الحركة."); } finally { setBusy(false); }
  }
  const inflow = data.transactions
      .filter(
        (item) =>
          item.status === "POSTED" &&
          [
            "OWNER_FUNDING",
            "MANUAL_DEPOSIT",
            "INCOMING_COLLECTION",
            "OPENING_BALANCE",
          ].includes(item.type),
      )
      .reduce((sum, item) => sum + item.amountCents, 0),
    outflow = data.transactions
      .filter(
        (item) =>
          item.status === "POSTED" &&
          ["MANUAL_EXPENSE", "INCOMING_COLLECTION_REVERSAL"].includes(
            item.type,
          ),
      )
      .reduce((sum, item) => sum + item.amountCents, 0);
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">
            السيولة والحساب البنكي
          </p>
          <h1 className="mt-1 text-2xl font-black">البنك والسيولة</h1>
          <p className="mt-2 text-sm text-slate-500">
            دفتر الحساب البنكي الرئيسي: التحصيلات الواردة، تمويل المالك،
            والتسويات والمصروفات البنكية.
          </p>
        </div>
        {data.canManage && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"
          >
            <Plus size={17} />
            إضافة حركة بنكية
          </button>
        )}
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="رصيد البنك الحالي"
          value={`${money(data.balanceCents)} ج.م`}
          icon={Landmark}
          tone="blue"
        />
        <KpiCard
          label="إجمالي الوارد"
          value={`${money(inflow)} ج.م`}
          icon={ReceiptText}
          tone="emerald"
        />
        <KpiCard
          label="إجمالي المنصرف"
          value={`${money(outflow)} ج.م`}
          icon={Building2}
          tone="amber"
        />
      </section>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bank-movement-title"
        >
          <section className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 id="bank-movement-title" className="font-black">
                  إضافة حركة بنكية
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  سجل حركة واحدة مع بيانها ومرفقها إن وجد.
                </p>
              </div>
              <button
                type="button"
                aria-label="إغلاق"
                className="erp-icon-action"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold">
                نوع الحركة
                <ERPSelect name="type" value={type} onValueChange={setType}>
                  {Object.entries(bankTypes)
                    .filter(
                      ([key]) =>
                        !["INCOMING_COLLECTION", "OPENING_BALANCE"].includes(
                          key,
                        ),
                    )
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </ERPSelect>
              </label>
              <label className="grid gap-2 text-xs font-bold">
                القيمة *<CurrencyInput name="amount" required min={0.01} />
              </label>
              <label className="grid gap-2 text-xs font-bold">
                التاريخ *
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                  className={expenseInput}
                />
              </label>
              <label className="grid gap-2 text-xs font-bold">
                المشروع / عام الشركة
                <ERPSelect name="projectId">
                  <option value="">عام الشركة</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </ERPSelect>
              </label>
              {type === "MANUAL_EXPENSE" && (
                <label className="grid gap-2 text-xs font-bold">
                  تصنيف المصروف *
                  <ERPSelect name="categoryKey" required>
                    <option value="">اختر التصنيف</option>
                    {Object.entries(bankCategories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </ERPSelect>
                </label>
              )}
              {type === "MANUAL_DEPOSIT" && (
                <label className="grid gap-2 text-xs font-bold">
                  الحساب المقابل *
                  <ERPSelect name="counterAccountKey" required>
                    <option value="OWNER_FUNDING">تمويلات المالك</option>
                    <option value="OPENING_BALANCE">تسوية / رصيد مرحّل</option>
                  </ERPSelect>
                </label>
              )}
              <label className="grid gap-2 text-xs font-bold">
                رقم المرجع
                <input name="reference" className={expenseInput} />
              </label>
              <label className="grid gap-2 text-xs font-bold md:col-span-2">
                البيان *
                <input name="description" required className={expenseInput} />
              </label>
              <div className="md:col-span-2">
                <UploadBox name="files" label="مرفق الحركة — اختياري" />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <button
                  disabled={busy}
                  className={`${expenseButton} !bg-blue-700 !text-white`}
                >
                  {busy ? "جارٍ الحفظ…" : "حفظ وترحيل الحركة"}
                </button>
                <button
                  type="button"
                  className="erp-back-tab"
                  onClick={() => setOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {reverseId && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"><section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" dir="rtl"><div className="flex items-center justify-between"><h2 className="font-black text-red-700">إلغاء الحركة البنكية</h2><button type="button" className="erp-icon-action" onClick={() => setReverseId(null)}><X className="size-4" /></button></div><p className="mt-2 text-sm text-slate-600">سيتم الاحتفاظ بالحركة في السجل وتسجيل قيد عكسي. المرفق اختياري.</p><form onSubmit={reverse} className="mt-4 space-y-3"><label className="grid gap-2 text-xs font-bold">سبب الإلغاء *<textarea name="reason" required minLength={2} className="erp-control min-h-24" /></label><UploadBox name="files" label="مرفق إثبات الإلغاء — اختياري" /><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">تأكيد إلغاء الحركة</button><button type="button" className="erp-back-tab" onClick={() => setReverseId(null)}>تراجع</button></div></form></section></div>}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
      <section className="erp-table-shell">
        <div className="border-b bg-white p-4">
          <h2 className="font-black">
            دفتر البنك — {data.account?.name || "الحساب الرئيسي"}
          </h2>
        </div>
        <div className="erp-table-scroll">
          <table className="erp-data-table erp-responsive-table min-w-[900px]">
            <thead>
              <tr>
                {[
                  "التاريخ",
                  "النوع",
                  "البيان",
                  "المشروع / العام",
                  "وارد",
                  "منصرف",
                  "المرفق",
                  "المسجل",
                  "الإجراء",
                ].map((item) => (
                  <th key={item}>{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transactions
                .slice()
                .reverse()
                .map((item) => {
                  const incoming = [
                    "OWNER_FUNDING",
                    "MANUAL_DEPOSIT",
                    "INCOMING_COLLECTION",
                    "OPENING_BALANCE",
                  ].includes(item.type);
                  return (
                    <tr key={item.id} className={item.status === "REVERSED" ? "bg-red-50 text-red-700" : ""}>
                      <td>{item.transactionDate.slice(0, 10)}</td>
                      <td>
                        {bankTypes[item.type as keyof typeof bankTypes] ||
                          item.type}
                      </td>
                      <td>
                        <b>{item.description}</b>
                        {item.reference && (
                          <p className="text-xs text-slate-400">
                            {item.reference}
                          </p>
                        )}
                      </td>
                      <td>{item.project?.name || "عام الشركة"}</td>
                      <td>
                        {incoming ? (
                          <MoneyValue>{money(item.amountCents)} ج.م</MoneyValue>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {!incoming ? (
                          <MoneyValue>{money(item.amountCents)} ج.م</MoneyValue>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.attachments[0] ? <a className="relative inline-flex text-blue-700" href={`/api/bank/attachments/${item.attachments[0].id}`} target="_blank" title={item.attachments[0].label}><Paperclip className="size-4" />{item.attachments.length > 1 && <span className="absolute -left-2 -top-2 rounded-full bg-blue-700 px-1 text-[9px] text-white">{item.attachments.length}</span>}</a> : "—"}
                      </td>
                      <td>{item.actor.name}{item.status === "REVERSED" && <p className="text-xs font-bold">ملغاة: {item.reversalReason}</p>}</td>
                      <td>{data.canManage && item.status === "POSTED" && !item.sourceType ? <button type="button" className="text-xs font-bold text-red-700 underline" onClick={() => setReverseId(item.id)}>إلغاء الحركة</button> : item.status === "REVERSED" ? <span className="text-xs font-bold text-red-700">ملغاة</span> : "—"}</td>
                    </tr>
                  );
                })}
              {!data.transactions.length && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400">
                    لا توجد حركات بنكية بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
