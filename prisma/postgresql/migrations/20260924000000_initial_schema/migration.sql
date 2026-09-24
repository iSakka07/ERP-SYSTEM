-- CreateTable
CREATE TABLE "SystemMetadata" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMetadata_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleId" TEXT,
    "employeeId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialOperationRequest" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "businessHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseJson" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summaryJson" TEXT,
    "duplicateOfId" TEXT,
    "duplicateConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialOperationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingContract" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalCents" DOUBLE PRECISION NOT NULL,
    "estimateReference" TEXT,
    "estimateCents" DOUBLE PRECISION,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingStatement" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CURRENT',
    "grossCents" DOUBLE PRECISION NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'COMPANY',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCertificate" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "totalCents" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCertificateItem" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" DOUBLE PRECISION NOT NULL,
    "totalCents" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MaterialCertificateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingMemo" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "phone" TEXT,
    "monthlySalaryCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalaryAllocation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalaryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBonus" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDeduction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "remainingCents" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "repaymentMode" TEXT NOT NULL DEFAULT 'NEXT_PAYROLL',
    "installmentCents" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'EXECUTIVE_DIRECTOR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceInstallment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "payrollLineId" TEXT,
    "dueMonth" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "appliedCents" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AdvanceInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "totalCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentSource" TEXT NOT NULL DEFAULT 'EXECUTIVE_DIRECTOR',
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "approvedById" TEXT NOT NULL,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicCents" DOUBLE PRECISION NOT NULL,
    "bonusCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netCents" DOUBLE PRECISION NOT NULL,
    "allocationJson" TEXT NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAttachment" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "advanceId" TEXT,
    "bonusId" TEXT,
    "deductionId" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEngineerAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEngineerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractStatement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CURRENT',
    "stage" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "grossCents" DOUBLE PRECISION NOT NULL,
    "deductionCents" DOUBLE PRECISION NOT NULL,
    "netCents" DOUBLE PRECISION NOT NULL,
    "previousGrossCents" DOUBLE PRECISION NOT NULL,
    "correctionDebtCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "executiveApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractItem" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "previousQuantity" DOUBLE PRECISION NOT NULL,
    "currentQuantity" DOUBLE PRECISION NOT NULL,
    "correctionQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correctionReason" TEXT,
    "entitlementPercent" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" DOUBLE PRECISION NOT NULL,
    "previousValueCents" DOUBLE PRECISION NOT NULL,
    "totalCents" DOUBLE PRECISION NOT NULL,
    "sourceItemKey" TEXT,
    "priceChangeReason" TEXT,

    CONSTRAINT "SubcontractItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractDeduction" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SubcontractDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractPayment" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractApproval" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkWithdrawal" (
    "id" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "sourceStatementId" TEXT NOT NULL,
    "destinationAccountId" TEXT,
    "destinationCompanyId" TEXT,
    "itemKey" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "itemKeysJson" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "withdrawnScope" TEXT NOT NULL,
    "retainedScope" TEXT,
    "retainedItemKey" TEXT,
    "reason" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "snapshotJson" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "totalCents" DOUBLE PRECISION NOT NULL,
    "paymentSource" TEXT NOT NULL DEFAULT 'EXECUTIVE_DIRECTOR',
    "stockMode" TEXT NOT NULL DEFAULT 'LEGACY_DIRECT',
    "warehouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" DOUBLE PRECISION NOT NULL,
    "totalCents" DOUBLE PRECISION NOT NULL,
    "inventoryItemId" TEXT,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MAIN',
    "projectId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "minimumQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "projectId" TEXT,
    "purchaseInvoiceId" TEXT,
    "recipient" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovementLine" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCostCents" DOUBLE PRECISION NOT NULL,
    "totalCents" DOUBLE PRECISION NOT NULL,
    "sourcePurchaseItemId" TEXT,

    CONSTRAINT "StockMovementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "countDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bookQuantity" DOUBLE PRECISION NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "unitCostCents" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MAIN',
    "employeeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "amountCents" DOUBLE PRECISION NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "sourceAccountId" TEXT,
    "destinationAccountId" TEXT,
    "projectId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "documentNumber" TEXT,
    "fundingSource" TEXT,
    "recordedById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashAttachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashCount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expectedCents" DOUBLE PRECISION NOT NULL,
    "actualCents" DOUBLE PRECISION NOT NULL,
    "differenceCents" DOUBLE PRECISION NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "categoryKey" TEXT,
    "counterAccountKey" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAttachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "systemKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowManualEntry" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "projectId" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "counterpartyType" TEXT,
    "counterpartyId" TEXT,
    "description" TEXT,
    "debitCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_permissionId_idx" ON "UserPermissionOverride"("permissionId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialOperationRequest_operation_businessHash_createdAt_idx" ON "FinancialOperationRequest"("operation", "businessHash", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialOperationRequest_entityType_entityId_idx" ON "FinancialOperationRequest"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperationRequest_actorId_operation_idempotencyKey_key" ON "FinancialOperationRequest"("actorId", "operation", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingContract_number_key" ON "IncomingContract"("number");

-- CreateIndex
CREATE INDEX "IncomingContract_active_idx" ON "IncomingContract"("active");

-- CreateIndex
CREATE INDEX "IncomingContract_projectId_active_idx" ON "IncomingContract"("projectId", "active");

-- CreateIndex
CREATE INDEX "IncomingStatement_contractId_stage_idx" ON "IncomingStatement"("contractId", "stage");

-- CreateIndex
CREATE INDEX "IncomingStatement_stage_paidAt_idx" ON "IncomingStatement"("stage", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingStatement_contractId_sequence_key" ON "IncomingStatement"("contractId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCertificate_number_key" ON "MaterialCertificate"("number");

-- CreateIndex
CREATE INDEX "MaterialCertificate_statementId_idx" ON "MaterialCertificate"("statementId");

-- CreateIndex
CREATE INDEX "MaterialCertificateItem_certificateId_idx" ON "MaterialCertificateItem"("certificateId");

-- CreateIndex
CREATE INDEX "IncomingAttachment_entityType_entityId_idx" ON "IncomingAttachment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE INDEX "EmployeeSalaryAllocation_employeeId_startDate_idx" ON "EmployeeSalaryAllocation"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "EmployeeSalaryAllocation_projectId_startDate_idx" ON "EmployeeSalaryAllocation"("projectId", "startDate");

-- CreateIndex
CREATE INDEX "EmployeeBonus_employeeId_month_idx" ON "EmployeeBonus"("employeeId", "month");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_employeeId_month_idx" ON "EmployeeDeduction"("employeeId", "month");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_employeeId_status_idx" ON "EmployeeAdvance"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdvanceInstallment_advanceId_dueMonth_key" ON "AdvanceInstallment"("advanceId", "dueMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_key" ON "PayrollRun"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_payrollRunId_employeeId_key" ON "PayrollLine"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryAttachment_payrollRunId_idx" ON "SalaryAttachment"("payrollRunId");

-- CreateIndex
CREATE INDEX "SalaryAttachment_advanceId_idx" ON "SalaryAttachment"("advanceId");

-- CreateIndex
CREATE INDEX "SalaryAttachment_bonusId_idx" ON "SalaryAttachment"("bonusId");

-- CreateIndex
CREATE INDEX "SalaryAttachment_deductionId_idx" ON "SalaryAttachment"("deductionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEngineerAssignment_projectId_employeeId_startDate_key" ON "ProjectEngineerAssignment"("projectId", "employeeId", "startDate");

-- CreateIndex
CREATE INDEX "SubcontractAccount_active_idx" ON "SubcontractAccount"("active");

-- CreateIndex
CREATE INDEX "SubcontractAccount_projectId_active_idx" ON "SubcontractAccount"("projectId", "active");

-- CreateIndex
CREATE INDEX "SubcontractStatement_accountId_stage_idx" ON "SubcontractStatement"("accountId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractStatement_accountId_sequence_key" ON "SubcontractStatement"("accountId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractItem_statementId_itemKey_key" ON "SubcontractItem"("statementId", "itemKey");

-- CreateIndex
CREATE INDEX "SubcontractPayment_statementId_status_paymentDate_idx" ON "SubcontractPayment"("statementId", "status", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "WorkWithdrawal_destinationAccountId_key" ON "WorkWithdrawal"("destinationAccountId");

-- CreateIndex
CREATE INDEX "WorkWithdrawal_sourceAccountId_stage_idx" ON "WorkWithdrawal"("sourceAccountId", "stage");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_entityType_entityId_idx" ON "ExpenseAttachment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_number_key" ON "PurchaseInvoice"("number");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_projectId_idx" ON "PurchaseInvoice"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_projectId_status_invoiceDate_idx" ON "PurchaseInvoice"("projectId", "status", "invoiceDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_projectId_key" ON "Warehouse"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE INDEX "InventoryItem_active_name_idx" ON "InventoryItem"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_unit_key" ON "InventoryItem"("name", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_number_key" ON "StockMovement"("number");

-- CreateIndex
CREATE INDEX "StockMovement_movementDate_type_idx" ON "StockMovement"("movementDate", "type");

-- CreateIndex
CREATE INDEX "StockMovement_fromWarehouseId_movementDate_idx" ON "StockMovement"("fromWarehouseId", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_toWarehouseId_movementDate_idx" ON "StockMovement"("toWarehouseId", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_projectId_movementDate_idx" ON "StockMovement"("projectId", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_purchaseInvoiceId_idx" ON "StockMovement"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "StockMovementLine_itemId_movementId_idx" ON "StockMovementLine"("itemId", "movementId");

-- CreateIndex
CREATE INDEX "StockMovementLine_sourcePurchaseItemId_idx" ON "StockMovementLine"("sourcePurchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_number_key" ON "InventoryCount"("number");

-- CreateIndex
CREATE INDEX "InventoryCount_warehouseId_countDate_idx" ON "InventoryCount"("warehouseId", "countDate");

-- CreateIndex
CREATE INDEX "InventoryCountLine_countId_itemId_idx" ON "InventoryCountLine"("countId", "itemId");

-- CreateIndex
CREATE INDEX "PurchaseAttachment_entityType_entityId_idx" ON "PurchaseAttachment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashCategory_key_key" ON "PettyCashCategory"("key");

-- CreateIndex
CREATE INDEX "PettyCashAccount_type_employeeId_idx" ON "PettyCashAccount"("type", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashTransaction_number_key" ON "PettyCashTransaction"("number");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_transactionDate_type_idx" ON "PettyCashTransaction"("transactionDate", "type");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_projectId_idx" ON "PettyCashTransaction"("projectId");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_sourceAccountId_transactionDate_idx" ON "PettyCashTransaction"("sourceAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_destinationAccountId_transactionDate_idx" ON "PettyCashTransaction"("destinationAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "PettyCashAttachment_transactionId_idx" ON "PettyCashAttachment"("transactionId");

-- CreateIndex
CREATE INDEX "PettyCashCount_accountId_countedAt_idx" ON "PettyCashCount"("accountId", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_name_key" ON "BankAccount"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_number_key" ON "BankTransaction"("number");

-- CreateIndex
CREATE INDEX "BankTransaction_transactionDate_type_idx" ON "BankTransaction"("transactionDate", "type");

-- CreateIndex
CREATE INDEX "BankTransaction_projectId_idx" ON "BankTransaction"("projectId");

-- CreateIndex
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_transactionDate_idx" ON "BankTransaction"("accountId", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_sourceType_sourceId_key" ON "BankTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BankAttachment_transactionId_idx" ON "BankAttachment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_code_key" ON "AccountingAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_systemKey_key" ON "AccountingAccount"("systemKey");

-- CreateIndex
CREATE INDEX "AccountingAccount_type_active_idx" ON "AccountingAccount"("type", "active");

-- CreateIndex
CREATE INDEX "AccountingAccount_parentId_idx" ON "AccountingAccount"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_month_key" ON "AccountingPeriod"("month");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_status_idx" ON "JournalEntry"("entryDate", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_projectId_entryDate_idx" ON "JournalEntry"("projectId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_key" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_createdAt_idx" ON "JournalLine"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_projectId_createdAt_idx" ON "JournalLine"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_counterpartyType_counterpartyId_idx" ON "JournalLine"("counterpartyType", "counterpartyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingContract" ADD CONSTRAINT "IncomingContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingStatement" ADD CONSTRAINT "IncomingStatement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "IncomingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCertificate" ADD CONSTRAINT "MaterialCertificate_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "IncomingStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCertificateItem" ADD CONSTRAINT "MaterialCertificateItem_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "MaterialCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingMemo" ADD CONSTRAINT "IncomingMemo_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "IncomingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryAllocation" ADD CONSTRAINT "EmployeeSalaryAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryAllocation" ADD CONSTRAINT "EmployeeSalaryAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDeduction" ADD CONSTRAINT "EmployeeDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceInstallment" ADD CONSTRAINT "AdvanceInstallment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceInstallment" ADD CONSTRAINT "AdvanceInstallment_payrollLineId_fkey" FOREIGN KEY ("payrollLineId") REFERENCES "PayrollLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAttachment" ADD CONSTRAINT "SalaryAttachment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAttachment" ADD CONSTRAINT "SalaryAttachment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAttachment" ADD CONSTRAINT "SalaryAttachment_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "EmployeeBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAttachment" ADD CONSTRAINT "SalaryAttachment_deductionId_fkey" FOREIGN KEY ("deductionId") REFERENCES "EmployeeDeduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEngineerAssignment" ADD CONSTRAINT "ProjectEngineerAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEngineerAssignment" ADD CONSTRAINT "ProjectEngineerAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractAccount" ADD CONSTRAINT "SubcontractAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractAccount" ADD CONSTRAINT "SubcontractAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractStatement" ADD CONSTRAINT "SubcontractStatement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SubcontractAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractItem" ADD CONSTRAINT "SubcontractItem_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractDeduction" ADD CONSTRAINT "SubcontractDeduction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractPayment" ADD CONSTRAINT "SubcontractPayment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractApproval" ADD CONSTRAINT "SubcontractApproval_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkWithdrawal" ADD CONSTRAINT "WorkWithdrawal_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "SubcontractAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkWithdrawal" ADD CONSTRAINT "WorkWithdrawal_sourceStatementId_fkey" FOREIGN KEY ("sourceStatementId") REFERENCES "SubcontractStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkWithdrawal" ADD CONSTRAINT "WorkWithdrawal_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "SubcontractAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_sourcePurchaseItemId_fkey" FOREIGN KEY ("sourcePurchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAccount" ADD CONSTRAINT "PettyCashAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "PettyCashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "PettyCashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PettyCashCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAttachment" ADD CONSTRAINT "PettyCashAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PettyCashTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashCount" ADD CONSTRAINT "PettyCashCount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PettyCashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAttachment" ADD CONSTRAINT "BankAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

