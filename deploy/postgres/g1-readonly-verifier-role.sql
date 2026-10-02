-- SOURCE TEMPLATE ONLY. NOT EXECUTED. Do not use until the PostgreSQL owner
-- confirms the staging database, schema, table, effective ACLs, and RLS policy.
-- The guard intentionally stops psql unless an operator explicitly supplies
-- G1_ROLE_TEMPLATE_APPROVED=true after separate change approval.
\if :{?G1_ROLE_TEMPLATE_APPROVED}
\if :G1_ROLE_TEMPLATE_APPROVED
\else
\echo 'STOP: explicit role-template approval is required.'
\quit 3
\endif
\else
\echo 'STOP: explicit role-template approval is required.'
\quit 3
\endif

-- Replace these placeholders only after database-owner verification.
\set database_name '__CONFIRM_STAGING_DATABASE__'
\set application_schema '__CONFIRM_APPLICATION_SCHEMA__'
\set user_table '__CONFIRM_USER_TABLE__'
\set verifier_role 'scrolith_g1_verifier_ro'

-- Creation is limited to a login role with no elevated role attributes.
-- Do not add a password here; inject a rotated credential using the approved
-- secret provider after the role is created by the authorized DB owner.
CREATE ROLE scrolith_g1_verifier_ro
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  NOINHERIT;

GRANT CONNECT ON DATABASE :"database_name" TO scrolith_g1_verifier_ro;
GRANT USAGE ON SCHEMA :"application_schema" TO scrolith_g1_verifier_ro;
GRANT SELECT ("id", "email", "role", "isActive")
  ON TABLE :"application_schema".:"user_table"
  TO scrolith_g1_verifier_ro;

-- Optional DBA-run verification queries. Any unexpected true privilege,
-- owner relationship, membership, or accessible SECURITY DEFINER routine is STOP.

-- 1. Role attributes: expected login=true and all other listed flags=false.
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname = :'verifier_role';

-- 2. The verifier role must not own the connected database, target schema,
-- or target User table.
SELECT current_database() AS connected_database,
       pg_get_userbyid(d.datdba) = :'verifier_role' AS owns_database,
       pg_get_userbyid(n.nspowner) = :'verifier_role' AS owns_schema,
       pg_get_userbyid(c.relowner) = :'verifier_role' AS owns_user_table
FROM pg_database d
JOIN pg_namespace n ON n.nspname = :'application_schema'
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = :'user_table'
WHERE d.datname = current_database();

-- 3. No direct or transitive role memberships are expected.
WITH RECURSIVE inherited_roles(member_oid, granted_role_oid) AS (
  SELECT m.member, m.roleid
  FROM pg_auth_members m
  WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = :'verifier_role')
  UNION
  SELECT m.member, m.roleid
  FROM pg_auth_members m
  JOIN inherited_roles i ON m.member = i.granted_role_oid
)
SELECT DISTINCT member_role.rolname AS member_role,
       granted_role.rolname AS granted_role
FROM inherited_roles i
JOIN pg_roles member_role ON member_role.oid = i.member_oid
JOIN pg_roles granted_role ON granted_role.oid = i.granted_role_oid;

-- 4. Expected effective database/schema privileges: CONNECT=true,
-- USAGE=true, CREATE=false. Run while connected to the target database.
SELECT has_database_privilege(:'verifier_role', current_database(), 'CONNECT') AS can_connect,
       has_schema_privilege(:'verifier_role', :'application_schema', 'USAGE') AS schema_usage,
       has_schema_privilege(:'verifier_role', :'application_schema', 'CREATE') AS schema_create;

-- 5. Table-level privileges must all be false, including broad SELECT.
SELECT has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'SELECT') AS table_select,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'INSERT') AS table_insert,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'UPDATE') AS table_update,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'DELETE') AS table_delete,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'TRUNCATE') AS table_truncate,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'REFERENCES') AS table_references,
       has_table_privilege(:'verifier_role',
         format('%I.%I', :'application_schema', :'user_table'), 'TRIGGER') AS table_trigger;

-- 6. Column SELECT must be true exactly for id, email, role, and isActive.
SELECT a.attname AS column_name,
       has_column_privilege(:'verifier_role', c.oid, a.attnum, 'SELECT') AS can_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = :'application_schema'
  AND c.relname = :'user_table'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

-- 7. Inspect PUBLIC ACLs on the current database, target schema, table,
-- and its columns. Any unexpected PUBLIC write/schema privilege is STOP.
SELECT 'database' AS object_kind, d.datname AS object_name, x.privilege_type
FROM pg_database d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) x
WHERE d.datname = current_database() AND x.grantee = 0
UNION ALL
SELECT 'schema', n.nspname, x.privilege_type
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) x
WHERE n.nspname = :'application_schema' AND x.grantee = 0
UNION ALL
SELECT 'table', c.relname, x.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
WHERE n.nspname = :'application_schema'
  AND c.relname = :'user_table'
  AND x.grantee = 0;

SELECT 'column' AS object_kind, a.attname AS object_name, x.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
CROSS JOIN LATERAL aclexplode(COALESCE(a.attacl, '{}'::aclitem[])) x
WHERE n.nspname = :'application_schema'
  AND c.relname = :'user_table'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND x.grantee = 0;

-- 8. Review all applicable row-level-security policies for the target table.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = :'application_schema'
  AND tablename = :'user_table'
ORDER BY policyname;

-- 9. Identify non-system SECURITY DEFINER routines executable by this role.
-- This is an inventory for DBA review, not an EXECUTE grant.
SELECT n.nspname AS routine_schema,
       p.proname AS routine_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND has_function_privilege(:'verifier_role', p.oid, 'EXECUTE')
ORDER BY n.nspname, p.proname;

-- Do not add grants, revoke PUBLIC/shared ACLs, or alter objects automatically.
-- Any unexpected effective privilege is STOP and requires a separate DB-owner decision.
