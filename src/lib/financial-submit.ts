"use client";

export type SimilarFinancialOperation = { confirmationToken: string; similar?: { id?: string | null; entityType?: string | null; createdAt?: string; summary?: Record<string, unknown> | null } };

const keys = new Map<string, string>();
const confirmations = new Map<string, string>();

export function financialHeaders(scope: string) {
  const key = keys.get(scope) || crypto.randomUUID();
  keys.set(scope, key);
  const headers: Record<string, string> = { "Idempotency-Key": key };
  const confirmation = confirmations.get(scope);
  if (confirmation) headers["Duplicate-Confirmation"] = confirmation;
  return headers;
}

export function confirmSimilarFinancialOperation(scope: string, token: string) { confirmations.set(scope, token); }
export function finishFinancialOperation(scope: string) { keys.delete(scope); confirmations.delete(scope); }

function previousUrl(similar?: SimilarFinancialOperation["similar"]) {
  const paths: Record<string, string> = { bankTransaction: "/bank", purchaseInvoice: "/purchases", pettyCashTransaction: "/petty-cash", pettyCashCount: "/petty-cash", employeeAdvance: "/salaries", employeeBonus: "/salaries", employeeDeduction: "/salaries", payrollRun: "/salaries", payment: "/expenses", statement: "/expenses" };
  const path = similar?.entityType ? paths[similar.entityType] : undefined;
  return path ? `${path}${similar?.id ? `?record=${encodeURIComponent(similar.id)}` : ""}` : null;
}

export function askToCreateSimilarFinancialOperation(details: SimilarFinancialOperation) {
  return new Promise<boolean>((resolve) => {
    document.getElementById("financial-duplicate-dialog")?.remove();
    const summary = details.similar?.summary || {}, amount = typeof summary.amountCents === "number" ? `${(summary.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م` : null;
    const overlay = document.createElement("div"); overlay.id = "financial-duplicate-dialog"; overlay.className = "fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
    const panel = document.createElement("section"); panel.className = "w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-5 text-right shadow-2xl"; panel.dir = "rtl";
    const title = document.createElement("h2"); title.className = "text-lg font-black text-slate-950"; title.textContent = "عملية مالية مشابهة";
    const text = document.createElement("p"); text.className = "mt-2 text-sm leading-6 text-slate-600"; text.textContent = "توجد عملية بنفس البيانات الأساسية. راجعها أو أكد أن هذه عملية مستقلة فعلًا.";
    const info = document.createElement("div"); info.className = "mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950"; info.textContent = [amount, summary.date || summary.issuedAt || summary.month, summary.number || summary.name || summary.type].filter(Boolean).join(" · ") || "عملية مسجلة سابقًا";
    const actions = document.createElement("div"); actions.className = "mt-5 flex flex-wrap gap-2";
    const close = (accepted: boolean) => { overlay.remove(); resolve(accepted); };
    const create = document.createElement("button"); create.type = "button"; create.className = "rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white"; create.textContent = "إنشاء كعملية مستقلة"; create.onclick = () => close(true);
    const url = previousUrl(details.similar); if (url) { const view = document.createElement("button"); view.type = "button"; view.className = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-blue-700"; view.textContent = "عرض العملية السابقة"; view.onclick = () => window.open(url, "_blank", "noopener,noreferrer"); actions.append(view); }
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"; cancel.textContent = "إلغاء"; cancel.onclick = () => close(false);
    actions.append(create, cancel); panel.append(title, text, info, actions); overlay.append(panel); document.body.append(overlay); create.focus();
  });
}

export async function financialResult(response: Response, scope: string) {
  const body = await response.json();
  if (response.ok) { finishFinancialOperation(scope); return { body, replayed: response.headers.get("Idempotency-Replayed") === "true" || body.replayed === true }; }
  if (response.status === 409 && body.code === "SIMILAR_FINANCIAL_OPERATION") throw Object.assign(new Error(body.error), { similarFinancialOperation: body as SimilarFinancialOperation });
  throw new Error(body.error || "تعذر حفظ العملية المالية.");
}
