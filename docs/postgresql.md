# Hostinger + Supabase deployment path

The approved production architecture is a Hostinger Node.js application for the Next.js ERP and a managed Supabase PostgreSQL database. The development database remains SQLite. The PostgreSQL schema and migration history are kept under `prisma/postgresql/`, so the SQLite database is not changed or used as a PostgreSQL deployment target.

## Current readiness

- `pnpm db:postgres:prepare` checks that the PostgreSQL Prisma schema matches the current application schema and preserves the existing initial migration.
- `pnpm db:postgres:validate` validates the provider-specific Prisma schema offline.
- The PostgreSQL history has an initial schema migration, supplier payment tracking, and a security migration enabling RLS and revoking Data API grants.
- ERP-Alsalama (`djtuxtlvzwawgldpmvoq`) has all three migrations applied and recorded in `_prisma_migrations`; 57 tables have RLS and the anon/authenticated roles have no table read grants. No connection secret is configured in Hostinger yet.
- Existing SQLite data is intentionally not copied. The approved deployment starts with a clean database; local SQLite remains available for development until a separate cleanup is approved.

## Existing Supabase PostgreSQL database

Use the existing ERP-Alsalama project. Do not create another project or import any SQLite records or attachments. Keep database passwords and connection strings in Hostinger's environment-variable settings or a protected local environment file; never put them in Git.

In the Supabase Connect panel, choose a **Session pooler** connection string for the Hostinger Node.js app. Supavisor's shared pooler supports IPv4 and Session mode is intended for persistent backend connections. Avoid Transaction pooler for this app unless deployment becomes serverless and Prisma is configured for PgBouncer transaction mode.

For deployment commands, provide:

- `POSTGRES_DATABASE_URL`: a migration-capable connection to this Supabase project, used only by the guarded PostgreSQL migration command. Prefer a separate database role for migrations if the deployment workflow allows it.
- `DATABASE_URL`: the Supabase Session pooler connection used at runtime by Prisma Client.

Both must target the same Supabase project. The migration command intentionally refuses to fall back to SQLite's `DATABASE_URL`.

```powershell
$env:POSTGRES_DATABASE_URL = "<migration-capable Supabase connection string>"
$env:DATABASE_URL = "<Supabase Session pooler connection string>"
$env:AUTH_URL = "https://erp.example.com"
$env:AUTH_SECRET = "<unique random secret, at least 32 characters>"
$env:BOOTSTRAP_ADMIN_NAME = "مدير النظام"
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<unique strong password, at least 12 characters>"
```

Do not print or commit these values. Set `ERP_BACKUP_DIR` to protected durable storage and install PostgreSQL client utilities (`pg_dump`, `pg_restore`) wherever backup verification runs. For the first setup, a single migration-capable URL may be used for both variables; separate runtime and migration roles are preferable for ongoing operations.

## Initialize the empty database

Run from a clean deployment checkout, with the Supabase URLs and production secrets already set. The first three migrations are already recorded on ERP-Alsalama; `db:postgres:migrate` should report nothing pending:

```powershell
pnpm install --frozen-lockfile
pnpm db:postgres:prepare
pnpm db:postgres:validate
pnpm db:postgres:generate
pnpm db:postgres:migrate
pnpm db:seed
pnpm db:accounting-setup
pnpm verify:production-env
pnpm build
```

`db:seed` (without `ERP_SEED_DEMO=true`) creates the secure first administrator only when there are no users, and sets up roles, permissions, warehouses, and base categories. `db:accounting-setup` creates the chart of accounts and bank account. Do not use `db:demo-setup` on production. Run these one-time initialization commands against the new Supabase project before opening the Hostinger app to users.

The PostgreSQL generator writes the active Prisma Client output. For Hostinger, use `pnpm db:postgres:generate` before building, then start with `pnpm start` and let the host provide its port. After generating it locally, run `pnpm db:generate` before returning to SQLite development.

## Releases and backups

Before a release, make and verify a PostgreSQL backup. Then deploy only reviewed, forward-only PostgreSQL migrations, build with the PostgreSQL client generated, and check `GET /api/health` before opening the site to users.

`pnpm db:backup` uses `pg_dump` to create a custom-format PostgreSQL archive. `pnpm db:verify-backup` currently checks that `pg_restore --list` can read the archive; it does not prove a full restore. A restore rehearsal into an isolated, disposable Supabase project or PostgreSQL database is a required deployment-readiness step. Supabase paid plans provide daily database backups, but keep an independent export as well; Supabase Storage objects, if added later, are backed up separately from the database.

Never edit an initial or applied migration. For future schema changes, create a new migration against a PostgreSQL development database, review the SQL, validate it, and only then deploy it. SQLite-specific migrations are not replayed on PostgreSQL; the PostgreSQL initial baseline represents the current core schema, while PostgreSQL-specific changes use their own forward-only migration files.

## Data handling and limitations

- No SQLite records, users, secrets, or binary attachments are imported into the clean production database.
- ERP-Alsalama has been provisioned and migrated. Runtime connectivity, administrator seeding, a restore rehearsal, and Hostinger publication remain pending deployment access and secret configuration.
- Keep the SQLite development database intact until the PostgreSQL deployment has passed acceptance. Any later removal of local test data should be a separate, explicit cleanup.
- The current application is not yet designed for multiple app instances with shared rate limiting; deploy a single instance unless shared infrastructure is added and tested.
