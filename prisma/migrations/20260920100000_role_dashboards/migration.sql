ALTER TABLE "User" ADD COLUMN "employeeId" TEXT;

CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

CREATE TABLE "UserPermissionOverride" (
  "userId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("userId", "permissionId"),
  CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserPermissionOverride_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserPermissionOverride_permissionId_idx" ON "UserPermissionOverride"("permissionId");
