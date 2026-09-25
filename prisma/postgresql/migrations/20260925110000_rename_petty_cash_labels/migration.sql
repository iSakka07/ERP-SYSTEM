UPDATE "Permission"
SET "name" = CASE "key"
  WHEN 'pettycash.view' THEN 'عرض صندوق النثريات'
  WHEN 'pettycash.manage' THEN 'إدارة صندوق النثريات'
  ELSE "name"
END
WHERE "key" IN ('pettycash.view', 'pettycash.manage');
