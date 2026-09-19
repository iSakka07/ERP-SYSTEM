"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IncomingEditor, type Attachment, type Editor, type Project } from "@/components/incoming-center";
import type { Movement } from "@/components/document-layout";
import { confirmSimilarFinancialOperation, financialHeaders, financialResult } from "@/lib/financial-submit";

export function IncomingDocumentPage({ editor, projects, attachments = [], isAdmin, movements = [], returnHref = "/incoming" }: { editor: Editor; projects: Project[]; attachments?: Attachment[]; isAdmin: boolean; movements?: (Movement & { entityId: string })[]; returnHref?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(payload: object, files: File[], estimateFiles: File[] = []) {
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("payload", JSON.stringify(payload));
      files.forEach(file => form.append("files", file)); estimateFiles.forEach(file => form.append("estimateFiles", file));
      const action = "action" in payload ? String(payload.action) : "unknown", record = payload as { id?: string; contractId?: string; statementId?: string }, financial = ["statement", "material", "memo", "stage"].includes(action), scope = `incoming-${action}-${record.id || record.statementId || record.contractId || "new"}`;
      const send = async (): Promise<void> => { try { const response = await fetch("/api/incoming", { method: "POST", body: form, ...(financial ? { headers: financialHeaders(scope) } : {}) }); if (financial) { await financialResult(response, scope); return; } const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر الحفظ."); } catch (reason) { const similar = (reason as { similarFinancialOperation?: { confirmationToken: string } }).similarFinancialOperation; if (similar && window.confirm("توجد عملية وارد مشابهة مسجلة من قبل. هل تريد إنشاءها كعملية مستقلة؟")) { confirmSimilarFinancialOperation(scope, similar.confirmationToken); return send(); } throw reason; } };
      await send();
      router.push(returnHref); router.refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "تعذر الاتصال. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">{message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p>}<IncomingEditor editor={editor} projects={projects} attachments={attachments} busy={busy} isAdmin={isAdmin} onCancel={() => router.push(returnHref)} onSave={save} movements={movements} /></div>;
}
