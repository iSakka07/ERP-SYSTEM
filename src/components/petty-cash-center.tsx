"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  FolderCog,
  Paperclip,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { IconAction, KpiCard, MoneyValue } from "@/components/erp-ui";
import {
  confirmSimilarFinancialOperation,
  financialHeaders,
  financialResult,
} from "@/lib/financial-submit";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import { isProjectCost, pettyLabels } from "@/lib/petty-cash";
import {
  pdfColumns,
  pdfMoney,
  previewDataPdf,
  usePdfDataExport,
} from "@/components/pdf-data-export";

type Named = { id: string; name: string };
type Category = Named & { active: boolean; requiresAttachment: boolean };
type Account = Named & {
  type: string;
  employeeId: string | null;
  balanceCents: number;
};
type Movement = {
  id: string;
  number: string;
  type: string;
  status: string;
  amountCents: number;
  projectId: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  transactionDate: string;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  description: string;
  project: { name: string } | null;
  category: { name: string } | null;
  recordedBy: { name: string };
  attachments: Named[];
};
type Data = {
  accounts: Account[];
  categories: Category[];
  transactions: Movement[];
  projects: Named[];
  employees: Named[];
  canManage: boolean;
};
type Drawer = "" | "transaction" | "reverse" | "category";
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-bold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PettyCashCenter() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(""),
    [section, setSection] = useState<"ledger" | "custodies" | "categories">(
      "ledger",
    ),
    [selected, setSelected] = useState("");
  const [showOverdueCustodies, setShowOverdueCustodies] = useState(false);
  const [type, setType] = useState("FUNDING"),
    [allocation, setAllocation] = useState("GENERAL"),
    [categoryId, setCategoryId] = useState(""),
    [accountId, setAccountId] = useState(""),
    [custodyAccountId, setCustodyAccountId] = useState(""),
    [month, setMonth] = useState(currentMonth()),
    [projectId, setProjectId] = useState(""),
    [filterType, setFilterType] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/petty-cash");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "تعذر تحميل الدفتر.");
    setData(body);
  };
  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "تعذر التحميل."),
      );
  }, []);
  usePdfDataExport(() => {
    if (!data) return;
    if (section === "categories") {
      void previewDataPdf({
        title: "تصنيفات النثريات",
        tables: [
          {
            columns: pdfColumns(["التصنيف", 3], ["المرفق إلزامي", 2]),
            rows: data.categories.map((item) => [
              item.name,
              item.requiresAttachment ? "نعم" : "لا",
            ]),
          },
        ],
      });
      return;
    }
    if (section === "custodies") {
      const custodies = data.accounts.filter((item) => item.type === "CUSTODY");
      void previewDataPdf({
        title: "العهد القائمة",
        tables: [
          {
            columns: pdfColumns(
              ["العهدة", 3],
              ["الموظف", 3],
              ["الرصيد", 2],
              ["الحالة", 2],
            ),
            rows: custodies.map((item) => [
              item.name,
              data.employees.find((employee) => employee.id === item.employeeId)
                ?.name || "—",
              pdfMoney(item.balanceCents),
              item.balanceCents ? "قائمة" : "مسوّاة",
            ]),
          },
        ],
      });
      return;
    }
    const main = data.accounts.find((item) => item.type === "MAIN");
    const currentId = accountId || main?.id || "";
    const currentAccount = data.accounts.find((item) => item.id === currentId);
    const rows = data.transactions
      .filter(
        (item) =>
          item.sourceAccountId === currentId ||
          item.destinationAccountId === currentId ||
          (currentAccount?.type === "MAIN" && item.type === "CUSTODY_EXPENSE"),
      )
      .sort((a, b) => {
        const byDate = a.transactionDate.localeCompare(b.transactionDate);
        if (byDate) return byDate;
        const aFunding = ["OPENING_BALANCE", "FUNDING"].includes(a.type)
            ? 0
            : 1,
          bFunding = ["OPENING_BALANCE", "FUNDING"].includes(b.type) ? 0 : 1;
        return aFunding - bFunding || a.createdAt.localeCompare(b.createdAt);
      })
      .reduce<
        {
          transaction: Movement;
          incoming: number;
          outgoing: number;
          balance: number;
        }[]
      >((all, transaction) => {
        const incoming =
          transaction.status === "POSTED" &&
          transaction.destinationAccountId === currentId
            ? transaction.amountCents
            : 0;
        const outgoing =
          transaction.status === "POSTED" &&
          transaction.sourceAccountId === currentId
            ? transaction.amountCents
            : 0;
        all.push({
          transaction,
          incoming,
          outgoing,
          balance: (all.at(-1)?.balance ?? 0) + incoming - outgoing,
        });
        return all;
      }, [])
      .filter(
        (row) =>
          (!month || row.transaction.transactionDate.startsWith(month)) &&
          (!projectId || row.transaction.projectId === projectId) &&
          (!filterType || row.transaction.type === filterType),
      );
    void previewDataPdf({
      title: "دفتر الصندوق التشغيلي",
      filters: [
        month,
        data.accounts.find((item) => item.id === currentId)?.name,
        data.projects.find((item) => item.id === projectId)?.name,
        pettyLabels[filterType],
      ]
        .filter(Boolean)
        .join(" · "),
      kpis: [
        {
          label: "رصيد الحساب المختار",
          value: pdfMoney(
            data.accounts.find((item) => item.id === currentId)?.balanceCents ??
              0,
          ),
          tone: "blue",
        },
      ],
      tables: [
        {
          columns: pdfColumns(
            ["التاريخ", 2],
            ["البيان", 3],
            ["المشروع / العام", 2],
            ["التصنيف", 2],
            ["وارد", 2],
            ["منصرف", 2],
            ["الرصيد بعد الحركة", 2],
          ),
          rows: rows
            .slice()
            .reverse()
            .map(({ transaction, incoming, outgoing, balance }) => {
              const cancelled = transaction.status === "REVERSED";
              const shownIncoming =
                cancelled && transaction.destinationAccountId === currentId
                  ? transaction.amountCents
                  : incoming;
              const shownOutgoing =
                cancelled && transaction.sourceAccountId === currentId
                  ? transaction.amountCents
                  : outgoing;
              return [
                transaction.transactionDate.slice(0, 10),
                `${transaction.description}${cancelled ? " · ملغاة" : ""}`,
                transaction.project?.name ||
                  (isProjectCost(transaction.type) ? "عام الشركة" : "—"),
                transaction.category?.name || "—",
                shownIncoming
                  ? `${pdfMoney(shownIncoming)}${cancelled ? " (ملغى)" : ""}`
                  : "—",
                shownOutgoing
                  ? `${pdfMoney(shownOutgoing)}${cancelled ? " (ملغى)" : ""}`
                  : "—",
                pdfMoney(balance),
              ];
            }),
        },
      ],
    });
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget,
      scope = `petty-${drawer}-${selected || "new"}`;
    const send = async (): Promise<void> => {
      try {
        const result = await financialResult(
          await fetch("/api/petty-cash", {
            method: "POST",
            body: new FormData(form),
            headers: financialHeaders(scope),
          }),
          scope,
        );
        await refresh();
        setDrawer("");
        setSelected("");
        setNotice(
          result.replayed
            ? "العملية مسجلة بالفعل ولم تتكرر."
            : "تم حفظ الحركة وتحديث رصيد الدفتر.",
        );
      } catch (reason) {
        const similar = (
          reason as {
            similarFinancialOperation?: { confirmationToken: string };
          }
        ).similarFinancialOperation;
        if (
          similar &&
          window.confirm(
            "توجد حركة مشابهة مسجلة من قبل. هل تريد إنشاءها كعملية مستقلة؟",
          )
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
  if (!data) return <p role="status">{error || "جارٍ تحميل دفتر النثريات…"}</p>;
  const main = data.accounts.find((account) => account.type === "MAIN"),
    custodies = data.accounts.filter((account) => account.type === "CUSTODY"),
    activeAccountId = accountId || main?.id || "",
    activeAccount = data.accounts.find(
      (account) => account.id === activeAccountId,
    ),
    category = data.categories.find((item) => item.id === categoryId),
    original = data.transactions.find((item) => item.id === selected),
    editedCategory = data.categories.find((item) => item.id === selected),
    expense = isProjectCost(type);
  const selectedCustody = custodies.find(
    (account) => account.id === custodyAccountId,
  );
  const accountRows = data.transactions
    .filter(
      (item) =>
        item.sourceAccountId === activeAccountId ||
        item.destinationAccountId === activeAccountId ||
        (activeAccount?.type === "MAIN" && item.type === "CUSTODY_EXPENSE"),
    )
    .sort((a, b) => {
      const byDate = a.transactionDate.localeCompare(b.transactionDate);
      if (byDate) return byDate;
      const aFunding = ["OPENING_BALANCE", "FUNDING"].includes(a.type) ? 0 : 1,
        bFunding = ["OPENING_BALANCE", "FUNDING"].includes(b.type) ? 0 : 1;
      return aFunding - bFunding || a.createdAt.localeCompare(b.createdAt);
    });
  const ledger = accountRows.reduce<
    {
      transaction: Movement;
      incoming: number;
      outgoing: number;
      balance: number;
    }[]
  >((all, transaction) => {
    const incoming =
        transaction.status === "POSTED" &&
        transaction.destinationAccountId === activeAccountId
          ? transaction.amountCents
          : 0,
      outgoing =
        transaction.status === "POSTED" &&
        transaction.sourceAccountId === activeAccountId
          ? transaction.amountCents
          : 0,
      balance = (all.at(-1)?.balance ?? 0) + incoming - outgoing;
    return [...all, { transaction, incoming, outgoing, balance }];
  }, []);
  const visible = ledger.filter(
    (row) =>
      (!month || row.transaction.transactionDate.startsWith(month)) &&
      (!projectId || row.transaction.projectId === projectId) &&
      (!filterType || row.transaction.type === filterType),
  );
  const received = visible.reduce(
      (sum, row) =>
        sum +
        (row.transaction.status === "POSTED" &&
        ["FUNDING", "OPENING_BALANCE"].includes(row.transaction.type)
          ? row.incoming
          : 0),
      0,
    ),
    spent = visible.reduce(
      (sum, row) =>
        sum +
        (row.transaction.status === "POSTED" &&
        isProjectCost(row.transaction.type)
          ? row.outgoing
          : 0),
      0,
    );
  const open = (next: Drawer, id = "") => {
    setDrawer(next);
    setSelected(id);
    setError("");
    setNotice("");
  };
  const accountName = (id: string | null) =>
    id
      ? data.accounts.find((account) => account.id === id)?.name ||
        "حساب غير متاح"
      : "خارج الصندوق";
  const custodyEmployeeName = (id: string | null) => {
    const employeeId = data.accounts.find(
      (account) => account.id === id,
    )?.employeeId;
    return employeeId
      ? data.employees.find((employee) => employee.id === employeeId)?.name ||
          "موظف غير متاح"
      : "";
  };
  const movementLabel = (transaction: Movement) =>
    transaction.type === "CUSTODY_ISSUE"
      ? `تسليم العهدة إلى ${custodyEmployeeName(transaction.destinationAccountId) || accountName(transaction.destinationAccountId)}`
      : transaction.type === "CUSTODY_EXPENSE"
        ? `مصروف من عهدة ${custodyEmployeeName(transaction.sourceAccountId) || accountName(transaction.sourceAccountId)}`
        : pettyLabels[transaction.type] || transaction.type;
  const overdueCustodies = custodies.flatMap((custody) => {
    const issue = data.transactions
      .filter(
        (transaction) =>
          transaction.type === "CUSTODY_ISSUE" &&
          transaction.destinationAccountId === custody.id &&
          transaction.status === "POSTED",
      )
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))[0];
    return issue &&
      custody.balanceCents > 0 &&
      new Date(`${issue.transactionDate.slice(0, 10)}T00:00:00`).getTime() <
        new Date().getTime() - 86_400_000
      ? [{ custody, issue }]
      : [];
  });
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">
            صندوق النثريات
          </p>
          <h1 className="mt-1 text-2xl font-black">دفتر الصندوق التشغيلي</h1>
          <p className="mt-2 text-sm text-slate-500">
            للمصروفات الصغيرة والعاجلة فقط؛ العهدة لا تصبح تكلفة إلا عند تسويتها
            بالإثبات.
          </p>
        </div>
        {data.canManage && (
          <button
            onClick={() => open("transaction")}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"
          >
            <Plus className="size-4" />
            إضافة حركة
          </button>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"
        >
          {notice}
        </p>
      )}
      {overdueCustodies.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b>تنبيه: توجد عهد خارج الخزنة لم تُسوَّ بعد.</b>
              <p className="mt-1 text-xs text-amber-800">
                {overdueCustodies.length}{" "}
                {overdueCustodies.length === 1
                  ? "عهدة تحتاج تسوية"
                  : "عهد تحتاج تسوية"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOverdueCustodies((shown) => !shown)}
              aria-expanded={showOverdueCustodies}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              {showOverdueCustodies ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </button>
          </div>
          {showOverdueCustodies && (
            <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
              {overdueCustodies.map(({ custody }) => (
                <p
                  key={custody.id}
                  className="rounded-lg bg-white/70 px-3 py-2"
                >
                  عهدة رقم {custody.name} · {custodyEmployeeName(custody.id)} ·
                  المتبقي {money(custody.balanceCents)} ج.م
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      <nav className="flex flex-wrap gap-2">
        <Tab
          active={section === "ledger"}
          icon={ClipboardList}
          onClick={() => setSection("ledger")}
        >
          دفتر الحركة
        </Tab>
        <Tab
          active={section === "custodies"}
          icon={WalletCards}
          onClick={() => setSection("custodies")}
        >
          العهد
        </Tab>
        <Tab
          active={section === "categories"}
          icon={FolderCog}
          onClick={() => setSection("categories")}
        >
          التصنيفات
        </Tab>
      </nav>
      {section === "ledger" && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <KpiCard
              label="رصيد الحساب المختار"
              value={`${money(activeAccount?.balanceCents ?? 0)} ج.م`}
              icon={WalletCards}
              tone="blue"
            />
            <KpiCard
              label="وارد الشهر"
              value={`${money(received)} ج.م`}
              icon={ReceiptText}
              tone="emerald"
            />
            <KpiCard
              label="منصرف الشهر"
              value={`${money(spent)} ج.م`}
              icon={ArrowLeft}
              tone="amber"
            />
            <KpiCard
              label="العهد القائمة"
              value={`${money(custodies.reduce((sum, account) => sum + account.balanceCents, 0))} ج.م`}
              icon={WalletCards}
              tone="violet"
            />
          </section>
          <section className="erp-table-shell">
            <div className="grid gap-3 border-b bg-white p-4 md:grid-cols-4">
              <Field label="الحساب">
                <ERPSelect value={activeAccountId} onValueChange={setAccountId}>
                  <option value={main?.id || ""}>
                    {main?.name || "الصندوق الرئيسي"}
                  </option>
                  {custodies.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </ERPSelect>
              </Field>
              <Field label="الشهر">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={expenseInput}
                />
              </Field>
              <Field label="المشروع / عام الشركة">
                <ERPSelect value={projectId} onValueChange={setProjectId}>
                  <option value="">كل المشروعات والعام</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </ERPSelect>
              </Field>
              <Field label="نوع الحركة">
                <ERPSelect value={filterType} onValueChange={setFilterType}>
                  <option value="">كل الحركات</option>
                  {Object.entries(pettyLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </ERPSelect>
              </Field>
            </div>
            <div className="erp-table-scroll">
              <table className="erp-data-table erp-responsive-table min-w-[1100px]">
                <thead>
                  <tr>
                    {[
                      "التاريخ",
                      "البيان",
                      "المشروع / العام",
                      "التصنيف",
                      "وارد",
                      "منصرف",
                      "الرصيد بعد الحركة",
                      "المرفق",
                      "المسجل",
                      "الإجراءات",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible
                    .slice()
                    .reverse()
                    .map(({ transaction, incoming, outgoing, balance }) => {
                      const cancelled = transaction.status === "REVERSED",
                        originalIncoming =
                          transaction.destinationAccountId === activeAccountId
                            ? transaction.amountCents
                            : 0,
                        originalOutgoing =
                          transaction.sourceAccountId === activeAccountId
                            ? transaction.amountCents
                            : 0;
                      return (
                        <tr
                          key={transaction.id}
                          className={
                            cancelled ? "bg-rose-50/70 text-slate-500" : ""
                          }
                        >
                          <td data-label="التاريخ">
                            {transaction.transactionDate.slice(0, 10)}
                          </td>
                          <td data-label="البيان">
                            <div className="flex flex-wrap items-center gap-2">
                              <b className={cancelled ? "line-through" : ""}>
                                {transaction.description}
                              </b>
                              {cancelled && (
                                <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
                                  ملغاة
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {movementLabel(transaction)}
                            </p>
                            {cancelled && transaction.reversalReason && (
                              <p className="mt-1 text-[11px] font-bold text-rose-700">
                                سبب الإلغاء: {transaction.reversalReason}
                              </p>
                            )}
                          </td>
                          <td data-label="المشروع / العام">
                            {transaction.project?.name ||
                              (isProjectCost(transaction.type)
                                ? "عام الشركة"
                                : "—")}
                          </td>
                          <td data-label="التصنيف">
                            {transaction.category?.name || "—"}
                          </td>
                          <td data-label="وارد" className="text-center">
                            {cancelled && originalIncoming ? (
                              <span className="font-bold text-rose-600 line-through">
                                {money(originalIncoming)} ج.م
                              </span>
                            ) : incoming ? (
                              <MoneyValue>{money(incoming)} ج.م</MoneyValue>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="منصرف" className="text-center">
                            {cancelled && originalOutgoing ? (
                              <span className="font-bold text-rose-600 line-through">
                                {money(originalOutgoing)} ج.م
                              </span>
                            ) : outgoing ? (
                              <MoneyValue>{money(outgoing)} ج.م</MoneyValue>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td
                            data-label="الرصيد بعد الحركة"
                            className="text-center"
                          >
                            <MoneyValue>{money(balance)} ج.م</MoneyValue>
                          </td>
                          <td data-label="المرفق" className="text-center">
                            {transaction.attachments.length ? (
                              <a
                                title="فتح المرفق"
                                aria-label="فتح المرفق"
                                className="inline-flex text-blue-700"
                                href={`/api/petty-cash/attachments/${transaction.attachments[0].id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Paperclip className="size-4" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="المسجل">
                            {transaction.recordedBy.name}
                          </td>
                          <td data-label="الإجراءات">
                            {data.canManage &&
                            transaction.status === "POSTED" ? (
                              <IconAction
                                label="إلغاء الحركة"
                                icon={Ban}
                                tone="danger"
                                onClick={() => open("reverse", transaction.id)}
                              />
                            ) : cancelled ? (
                              <span className="text-xs font-bold text-rose-700">
                                ملغاة
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {!visible.length && (
                    <tr>
                      <td
                        colSpan={10}
                        className="p-10 text-center text-slate-400"
                      >
                        لا توجد حركات ضمن الفلاتر الحالية.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {section === "custodies" && (
        <SimpleTable
          title="العهد القائمة"
          note="العهدة ليست تكلفة مشروع؛ يظهر المصروف عند تسوية العهدة فقط."
        >
          <table className="erp-data-table erp-responsive-table min-w-[660px]">
            <thead>
              <tr>
                {["العهدة", "الموظف", "الرصيد", "الحالة", "الإجراء"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {custodies.map((account) => (
                <tr key={account.id}>
                  <td data-label="العهدة">
                    <b>{account.name}</b>
                  </td>
                  <td data-label="الموظف">
                    {data.employees.find(
                      (employee) => employee.id === account.employeeId,
                    )?.name || "—"}
                  </td>
                  <td data-label="الرصيد" className="text-center">
                    <MoneyValue>{money(account.balanceCents)} ج.م</MoneyValue>
                  </td>
                  <td data-label="الحالة">
                    {account.balanceCents ? "قائمة" : "مسوّاة"}
                  </td>
                  <td data-label="الإجراء">
                    <button
                      className="text-sm font-bold text-blue-700"
                      onClick={() => {
                        setAccountId(account.id);
                        setSection("ledger");
                      }}
                    >
                      فتح دفتر العهدة
                    </button>
                  </td>
                </tr>
              ))}
              {!custodies.length && (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    لا توجد عهد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </SimpleTable>
      )}
      {section === "categories" && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black">تصنيفات النثريات</h2>
              <p className="mt-1 text-xs text-slate-500">
                تحدد لكل تصنيف إلزامية المرفق.
              </p>
            </div>
            {data.canManage && (
              <button
                className={expenseButton}
                onClick={() => open("category")}
              >
                إضافة تصنيف
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.categories.map((item) => (
              <article key={item.id} className="rounded-xl border p-4">
                <b>{item.name}</b>
                <p className="mt-2 text-xs text-slate-500">
                  المرفق: {item.requiresAttachment ? "إلزامي" : "اختياري"}
                </p>
                {data.canManage && (
                  <button
                    className="mt-3 text-xs font-bold text-blue-700"
                    onClick={() => open("category", item.id)}
                  >
                    تعديل
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {drawer && data.canManage && (
        <Drawer
          title={
            drawer === "transaction"
              ? "إضافة حركة"
              : drawer === "reverse"
                ? "إلغاء الحركة"
                : "إدارة تصنيف"
          }
          onClose={() => setDrawer("")}
        >
          <form
            key={`${drawer}-${selected}`}
            onSubmit={submit}
            className="space-y-4"
          >
            <input type="hidden" name="action" value={drawer} />
            {drawer === "transaction" && (
              <>
                <Field label="نوع الحركة">
                  <ERPSelect
                    name="type"
                    value={type}
                    onValueChange={(next) => {
                      setType(next);
                      setCustodyAccountId("");
                    }}
                  >
                    {Object.entries(pettyLabels)
                      .filter(([key]) => !key.startsWith("ADJUSTMENT"))
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </ERPSelect>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="القيمة *">
                    <CurrencyInput
                      name="amount"
                      required
                      min={0.01}
                      value={
                        type === "CUSTODY_RETURN"
                          ? selectedCustody
                            ? selectedCustody.balanceCents / 100
                            : ""
                          : undefined
                      }
                      readOnly={type === "CUSTODY_RETURN"}
                    />
                  </Field>
                  <Field label="التاريخ *">
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={today()}
                      className={expenseInput}
                    />
                  </Field>
                </div>
                {type === "FUNDING" && (
                  <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                    مصدر التمويل ثابت: المدير التنفيذي. أرفق إثبات استلام
                    التمويل.
                  </p>
                )}
                {type === "CUSTODY_ISSUE" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="الموظف *">
                      <ERPSelect name="employeeId" required>
                        <option value="">اختر الموظف</option>
                        {data.employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </ERPSelect>
                    </Field>
                    <Field label="اسم العهدة">
                      <input
                        name="custodyName"
                        className={expenseInput}
                        placeholder="اختياري"
                      />
                    </Field>
                  </div>
                )}
                {["CUSTODY_EXPENSE", "CUSTODY_RETURN"].includes(type) && (
                  <Field label="العهدة *">
                    <ERPSelect
                      name="sourceAccountId"
                      required
                      value={custodyAccountId}
                      onValueChange={setCustodyAccountId}
                    >
                      <option value="">اختر العهدة</option>
                      {custodies
                        .filter((account) => account.balanceCents > 0)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} — {money(account.balanceCents)} ج.م
                          </option>
                        ))}
                    </ERPSelect>
                  </Field>
                )}
                {expense && (
                  <>
                    <Field label="التحميل">
                      <ERPSelect
                        name="allocation"
                        value={allocation}
                        onValueChange={setAllocation}
                      >
                        <option value="GENERAL">عام الشركة</option>
                        <option value="PROJECT">مشروع</option>
                      </ERPSelect>
                    </Field>
                    {allocation === "PROJECT" && (
                      <Field label="المشروع *">
                        <ERPSelect name="projectId" required>
                          <option value="">اختر المشروع</option>
                          {data.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </ERPSelect>
                      </Field>
                    )}
                    <Field label="التصنيف *">
                      <ERPSelect
                        name="categoryId"
                        value={categoryId}
                        onValueChange={setCategoryId}
                        required
                      >
                        <option value="">اختر التصنيف</option>
                        {data.categories
                          .filter((item) => item.active)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </ERPSelect>
                    </Field>
                  </>
                )}
                <Field label="البيان *">
                  <input name="description" required className={expenseInput} />
                </Field>
                <UploadBox
                  name="files"
                  label="إثبات الحركة"
                  required={!expense || (category?.requiresAttachment ?? true)}
                />
              </>
            )}
            {drawer === "reverse" && original && (
              <>
                <input type="hidden" name="id" value={selected} />
                <section className="overflow-hidden rounded-xl border border-rose-200 bg-rose-50/60">
                  <div className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-100 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold text-rose-700">
                        الحركة المطلوب إلغاؤها
                      </p>
                      <h3 className="mt-1 font-black text-slate-900">
                        {original.description}
                      </h3>
                    </div>
                    <strong
                      className="whitespace-nowrap text-lg font-black text-rose-700"
                      dir="ltr"
                    >
                      {money(original.amountCents)} ج.م
                    </strong>
                  </div>
                  <dl className="grid gap-x-5 gap-y-3 p-4 text-xs sm:grid-cols-2">
                    <Detail
                      label="نوع الحركة"
                      value={pettyLabels[original.type] || original.type}
                    />
                    <Detail
                      label="تاريخ الحركة"
                      value={original.transactionDate.slice(0, 10)}
                    />
                    <Detail
                      label="من"
                      value={accountName(original.sourceAccountId)}
                    />
                    <Detail
                      label="إلى"
                      value={accountName(original.destinationAccountId)}
                    />
                    <Detail
                      label="المشروع / العام"
                      value={
                        original.project?.name ||
                        (isProjectCost(original.type) ? "عام الشركة" : "—")
                      }
                    />
                    <Detail
                      label="التصنيف"
                      value={original.category?.name || "—"}
                    />
                    <Detail label="سجلها" value={original.recordedBy.name} />
                  </dl>
                </section>
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                  بعد التأكيد ستظهر الحركة بعلامة «ملغاة»، ولن تؤثر قيمتها على
                  رصيد الصندوق أو تكلفة المشروع.
                </p>
                <Field label="سبب الإلغاء *">
                  <input name="reason" required className={expenseInput} />
                </Field>
                <UploadBox name="files" label="إثبات الإلغاء" required />
              </>
            )}
            {drawer === "category" && (
              <>
                <input type="hidden" name="id" value={selected} />
                <Field label="اسم التصنيف *">
                  <input
                    name="name"
                    required
                    defaultValue={editedCategory?.name}
                    className={expenseInput}
                  />
                </Field>
                {[
                  ["active", "نشط", editedCategory?.active ?? true],
                  [
                    "requiresAttachment",
                    "المرفق إلزامي",
                    editedCategory?.requiresAttachment ?? true,
                  ],
                ].map(([name, label, checked]) => (
                  <label key={String(name)} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={String(name)}
                      value="true"
                      defaultChecked={Boolean(checked)}
                    />
                    {label}
                  </label>
                ))}
              </>
            )}
            <button
              disabled={busy}
              className={`${expenseButton} ${drawer === "reverse" ? "!border-rose-700 !bg-rose-700" : "!border-blue-700 !bg-blue-700"} !text-white`}
            >
              {busy
                ? "جارٍ الحفظ…"
                : drawer === "reverse"
                  ? "تأكيد إلغاء الحركة"
                  : "تأكيد وحفظ"}
            </button>
          </form>
        </Drawer>
      )}
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-1 font-bold text-slate-800">{value}</dd>
    </div>
  );
}
function Tab({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof ClipboardList;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold ${active ? "border-blue-700 bg-blue-700 text-white" : "bg-white text-slate-600"}`}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}
function SimpleTable({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="erp-table-shell">
      <div className="border-b bg-white p-4">
        <h2 className="font-black">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
      </div>
      <div className="erp-table-scroll">{children}</div>
    </section>
  );
}
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/30"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" className={expenseButton} onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="py-5">{children}</div>
      </aside>
    </div>
  );
}
