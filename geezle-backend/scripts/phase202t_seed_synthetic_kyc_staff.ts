/**
 * Phase 20.2T — one-time synthetic privileged KYC staff seed.
 *
 * Creates least-privilege StaffRoles + Users + StaffUsers for security matrix.
 * Does NOT mint JWTs. Does NOT print passwords/tokens.
 *
 * Required env:
 *   DATABASE_URL
 * Optional:
 *   SYNTH_PASSWORD  (if unset, generates ephemeral password written only to SYNTH_CREDS_OUT)
 *   SYNTH_CREDS_OUT (default: .tmp-p202t-creds/staff.json — gitignored path)
 *
 * Run:
 *   npx ts-node --transpile-only scripts/phase202t_seed_synthetic_kyc_staff.ts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ensureRbacSeeded } from '../src/services/rbac.service';
import { KYC_FINE_PERMISSIONS } from '../src/services/kyc/kyc.constants';

const prisma = new PrismaClient();

type AccountSpec = {
  key: string;
  email: string;
  name: string;
  roleName: string;
  permissionKeys: string[];
};

const ACCOUNTS: AccountSpec[] = [
  {
    key: 'reviewer',
    email: 'kyc-reviewer-p202t@example.invalid',
    name: 'Synthetic KYC Reviewer P202T',
    roleName: 'Synthetic KYC Reviewer P202T',
    permissionKeys: [
      KYC_FINE_PERMISSIONS.CASE_READ,
      KYC_FINE_PERMISSIONS.DOCUMENT_VIEW,
      KYC_FINE_PERMISSIONS.REVIEW_RECOMMEND,
      'users.read'
    ]
  },
  {
    key: 'decision',
    email: 'kyc-decision-p202t@example.invalid',
    name: 'Synthetic KYC Decision Admin P202T',
    roleName: 'Synthetic KYC Decision Admin P202T',
    permissionKeys: [
      KYC_FINE_PERMISSIONS.CASE_READ,
      KYC_FINE_PERMISSIONS.DOCUMENT_VIEW,
      KYC_FINE_PERMISSIONS.DECISION_APPROVE,
      KYC_FINE_PERMISSIONS.DECISION_REJECT,
      KYC_FINE_PERMISSIONS.DECISION_RESUBMIT,
      KYC_FINE_PERMISSIONS.DECISION_REVOKE,
      'users.read'
    ]
  },
  {
    key: 'admin_no_kyc',
    email: 'admin-no-kyc-p202t@example.invalid',
    name: 'Synthetic Admin No KYC P202T',
    roleName: 'Synthetic Admin No KYC P202T',
    permissionKeys: [
      'users.read',
      'users.update_status',
      'staff.read',
      'support.tickets.read'
    ]
  }
];

const FORBIDDEN_ON_REVIEWER = new Set([
  KYC_FINE_PERMISSIONS.DECISION_APPROVE,
  KYC_FINE_PERMISSIONS.DECISION_REJECT,
  KYC_FINE_PERMISSIONS.DECISION_RESUBMIT,
  KYC_FINE_PERMISSIONS.DECISION_REVOKE
]);

const FORBIDDEN_ON_NO_KYC = new Set([
  KYC_FINE_PERMISSIONS.DOCUMENT_VIEW,
  KYC_FINE_PERMISSIONS.DECISION_APPROVE,
  KYC_FINE_PERMISSIONS.DECISION_REJECT,
  KYC_FINE_PERMISSIONS.DECISION_RESUBMIT,
  KYC_FINE_PERMISSIONS.DECISION_REVOKE,
  KYC_FINE_PERMISSIONS.CASE_READ,
  'kyc.read',
  'kyc.review'
]);

async function ensureRole(name: string, description: string, permissionKeys: string[]) {
  const role = await prisma.staffRole.upsert({
    where: { name },
    create: {
      name,
      description,
      isSystemRole: false,
      isActive: true
    },
    update: {
      description,
      isActive: true
    }
  });

  const perms = await prisma.staffPermission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true }
  });
  if (perms.length !== permissionKeys.length) {
    const found = new Set(perms.map((p) => p.key));
    const missing = permissionKeys.filter((k) => !found.has(k));
    throw new Error(`Missing permission seeds: ${missing.join(', ')}`);
  }

  await prisma.staffRolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.staffRolePermission.createMany({
    data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true
  });

  return role;
}

async function upsertStaffAccount(spec: AccountSpec, password: string) {
  const hash = await bcrypt.hash(password, 12);
  const role = await ensureRole(spec.roleName, `Phase 20.2T synthetic — ${spec.key}`, spec.permissionKeys);

  // Non-admin User.role so getStaffContext does not grant ALL_PERMISSION_KEYS
  const user = await prisma.user.upsert({
    where: { email: spec.email },
    create: {
      email: spec.email,
      name: spec.name,
      passwordHash: hash,
      role: 'STAFF',
      isActive: true,
      kycStatus: 'PENDING'
    },
    update: {
      name: spec.name,
      passwordHash: hash,
      role: 'STAFF',
      isActive: true
    }
  });

  const username = `${spec.key}.p202t@staff.local`;
  await prisma.staffUser.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: spec.name,
      email: spec.email,
      username,
      passwordHash: hash,
      roleId: role.id,
      status: 'ACTIVE',
      forcePasswordReset: false,
      require2FA: false
    },
    update: {
      fullName: spec.name,
      email: spec.email,
      username,
      passwordHash: hash,
      roleId: role.id,
      status: 'ACTIVE'
    }
  });

  const staff = await prisma.staffUser.findUnique({
    where: { userId: user.id },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: { select: { key: true } } } }
        }
      }
    }
  });

  const effective = new Set(staff?.role?.rolePermissions?.map((e) => e.permission.key) || []);
  return {
    key: spec.key,
    email: spec.email,
    userId: user.id,
    staffId: staff?.id,
    roleName: staff?.role?.name,
    permissions: Array.from(effective).sort(),
    password
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  await ensureRbacSeeded();

  const password =
    process.env.SYNTH_PASSWORD ||
    `Synth!${crypto.randomBytes(12).toString('base64url')}A1`;

  const results = [];
  for (const spec of ACCOUNTS) {
    // Enforce forbidden sets at seed time
    if (spec.key === 'reviewer') {
      for (const f of FORBIDDEN_ON_REVIEWER) {
        if (spec.permissionKeys.includes(f)) throw new Error(`reviewer must not have ${f}`);
      }
    }
    if (spec.key === 'admin_no_kyc') {
      for (const f of FORBIDDEN_ON_NO_KYC) {
        if (spec.permissionKeys.includes(f)) throw new Error(`admin_no_kyc must not have ${f}`);
      }
    }
    results.push(await upsertStaffAccount(spec, password));
  }

  const outDir = path.resolve(
    process.env.SYNTH_CREDS_OUT
      ? path.dirname(process.env.SYNTH_CREDS_OUT)
      : path.join(__dirname, '..', '.tmp-p202t-creds')
  );
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = process.env.SYNTH_CREDS_OUT || path.join(outDir, 'staff.json');
  // Write credentials once — caller must not print
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        note: 'Phase 20.2T synthetic staff — delete after matrix',
        accounts: results.map((r) => ({
          key: r.key,
          email: r.email,
          userId: r.userId,
          staffId: r.staffId,
          roleName: r.roleName,
          permissions: r.permissions,
          password: r.password
        }))
      },
      null,
      2
    ),
    { mode: 0o600 }
  );

  // Safe console output only
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        key: r.key,
        email: r.email,
        userId: r.userId,
        staffId: r.staffId,
        roleName: r.roleName,
        permissionCount: r.permissions.length,
        hasDecisionApprove: r.permissions.includes(KYC_FINE_PERMISSIONS.DECISION_APPROVE),
        hasDocumentView: r.permissions.includes(KYC_FINE_PERMISSIONS.DOCUMENT_VIEW)
      })
    );
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, credsPath: outFile, printedSecrets: false }));
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('SEED_FAILED', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
