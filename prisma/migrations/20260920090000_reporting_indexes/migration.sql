-- فهارس إضافية لمسارات الملفات المالية والتقارير. لا تعدل أي بيانات أو قواعد أعمال.
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "IncomingContract_projectId_active_idx" ON "IncomingContract"("projectId", "active");
CREATE INDEX "IncomingStatement_contractId_stage_idx" ON "IncomingStatement"("contractId", "stage");
CREATE INDEX "IncomingStatement_stage_paidAt_idx" ON "IncomingStatement"("stage", "paidAt");
CREATE INDEX "MaterialCertificate_statementId_idx" ON "MaterialCertificate"("statementId");
CREATE INDEX "MaterialCertificateItem_certificateId_idx" ON "MaterialCertificateItem"("certificateId");
CREATE INDEX "SubcontractAccount_projectId_active_idx" ON "SubcontractAccount"("projectId", "active");
CREATE INDEX "SubcontractStatement_accountId_stage_idx" ON "SubcontractStatement"("accountId", "stage");
CREATE INDEX "SubcontractPayment_statementId_status_paymentDate_idx" ON "SubcontractPayment"("statementId", "status", "paymentDate");
CREATE INDEX "PurchaseInvoice_projectId_status_invoiceDate_idx" ON "PurchaseInvoice"("projectId", "status", "invoiceDate");
CREATE INDEX "PettyCashTransaction_sourceAccountId_transactionDate_idx" ON "PettyCashTransaction"("sourceAccountId", "transactionDate");
CREATE INDEX "PettyCashTransaction_destinationAccountId_transactionDate_idx" ON "PettyCashTransaction"("destinationAccountId", "transactionDate");
CREATE INDEX "PettyCashAttachment_transactionId_idx" ON "PettyCashAttachment"("transactionId");
CREATE INDEX "BankTransaction_accountId_transactionDate_idx" ON "BankTransaction"("accountId", "transactionDate");
CREATE INDEX "BankAttachment_transactionId_idx" ON "BankAttachment"("transactionId");
