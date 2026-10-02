import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../../../deploy/postgres/g1-readonly-verifier-role.sql'), 'utf8');

describe('G1 verifier PostgreSQL role template static safety', () => {
  test('is guarded and creates only a least-privilege login role', () => {
    expect(sql.indexOf('\\if :{?G1_ROLE_TEMPLATE_APPROVED}')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('CREATE ROLE')).toBeGreaterThan(sql.indexOf('\\quit 3'));
    expect(sql).toMatch(/LOGIN\s+NOSUPERUSER\s+NOCREATEDB\s+NOCREATEROLE\s+NOREPLICATION\s+NOBYPASSRLS\s+NOINHERIT/s);
    expect(sql).not.toMatch(/^\s*CREATE\s+ROLE\b[^;]*\bPASSWORD\b/im);
    expect(sql).not.toMatch(/\bGRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|CREATE|ALTER|DROP|EXECUTE)\b/i);
  });

  test('grants only CONNECT, schema USAGE, and the four required column SELECT privileges', () => {
    const grants = Array.from(sql.matchAll(/^\s*GRANT\s+[\s\S]*?;/gim), (match) => match[0].replace(/\s+/g, ' ').trim().toUpperCase());
    expect(grants).toHaveLength(3);
    expect(grants[0]).toContain('GRANT CONNECT ON DATABASE');
    expect(grants[1]).toContain('GRANT USAGE ON SCHEMA');
    expect(grants[2]).toContain('GRANT SELECT ("ID", "EMAIL", "ROLE", "ISACTIVE") ON TABLE');
  });

  test('includes effective privilege, ownership, membership, PUBLIC ACL, RLS, and definer-routine checks', () => {
    for (const token of [
      'rolcanlogin', 'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls',
      'pg_auth_members', 'has_database_privilege', 'has_schema_privilege', 'has_table_privilege',
      'has_column_privilege', 'aclexplode', 'pg_policies', 'p.prosecdef', 'has_function_privilege',
    ]) expect(sql).toContain(token);
    expect(sql).toMatch(/GRANT\s+SELECT\s*\(\s*"id"\s*,\s*"email"\s*,\s*"role"\s*,\s*"isActive"\s*\)/i);
  });

  test('does not read application records or automatically revoke shared privileges', () => {
    expect(sql).not.toMatch(/SELECT\s+\*\s+FROM\s+(?:public\.)?"?User"?/i);
    expect(sql).not.toMatch(/^\s*REVOKE\b/im);
    expect(sql).toMatch(/unexpected effective privilege is STOP/i);
  });
});
