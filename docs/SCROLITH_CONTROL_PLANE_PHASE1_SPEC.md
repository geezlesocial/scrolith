# Scrolith Control Plane Phase 1 Spec

## Goal

Build a Scrolith-native Phase 1 control plane that adds:

- object-level permissions
- safe feature rollout controls
- moderation and trust operations
- admin-grade auditability

This phase must:

- preserve existing auth, wallet, payout, KYC, finance, messaging, and realtime behavior
- use additive schema changes only
- ship disabled by default behind native Scrolith flags
- fit the current admin architecture in `geezle-backend/src/routes/admin/index.ts`

## Existing Surfaces To Extend

Backend:

- `C:\Projects\geezle-backend\prisma\schema.prisma`
- `C:\Projects\geezle-backend\src\routes\admin\index.ts`
- `C:\Projects\geezle-backend\src\routes\admin\rbac.routes.ts`
- `C:\Projects\geezle-backend\src\controllers\community.moderation.controller.ts`
- `C:\Projects\geezle-backend\src\controllers\fraud.controller.ts`
- `C:\Projects\geezle-backend\src\controllers\notifications.controller.ts`
- `C:\Projects\geezle-backend\src\controllers\admin.systemSettings.controller.ts`

Frontend:

- `C:\Projects\geezle\src\dashboard\admin\RoleManagement.tsx`
- `C:\Projects\geezle\src\dashboard\admin\AppManagement.tsx`
- `C:\Projects\geezle\src\dashboard\admin\ModeratorConsole.tsx`
- `C:\Projects\geezle\src\dashboard\admin\InsightsGrowth.tsx`
- `C:\Projects\geezle\src\context\UserContext.tsx`
- `C:\Projects\geezle\src\context\SocketContext.tsx`
- `C:\Projects\geezle\src\services\admin.ts`

Current schema anchors:

- `StaffRole`, `StaffPermission`, `StaffRolePermission`, `StaffUser`
- `ModerationCase`, `ModerationAction`, `ModerationAuditLog`
- `Notification`, `DeviceToken`, `UserSettings`
- `CMSConfig`, `AuthAuditLog`

## Phase 1 Modules

1. `Policy Center`
2. `Feature Control Center`
3. `Moderation and Trust Center`
4. `Config and Rollback Foundations`

## 1. Prisma Schema Additions

All models below are additive and should be appended after the current staff and moderation models.

### 1.1 Policy Center Models

```prisma
model PolicyNamespace {
  id          String   @id @default(cuid())
  key         String   @unique
  label       String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  resources PolicyResource[]
  rules     PolicyRule[]
}

model PolicyResource {
  id              String   @id @default(cuid())
  namespaceId     String
  resourceType    String
  resourceId      String
  ownerUserId     String?
  visibility      String   @default("default")
  inheritanceMode String   @default("resource_first")
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  namespace PolicyNamespace @relation(fields: [namespaceId], references: [id], onDelete: Cascade)
  owner     User?           @relation(fields: [ownerUserId], references: [id], onDelete: SetNull)
  rules     PolicyRule[]    @relation("PolicyRuleResource")
  grants    UserPermissionOverride[]

  @@unique([resourceType, resourceId])
  @@index([namespaceId, resourceType])
  @@index([ownerUserId])
  @@index([visibility])
}

model PolicyRule {
  id                String   @id @default(cuid())
  namespaceId       String
  resourceRecordId  String?
  subjectType       String
  subjectId         String?
  action            String
  effect            String
  priority          Int      @default(100)
  conditions        Json?
  isActive          Boolean  @default(true)
  createdByStaffId  String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  namespace      PolicyNamespace @relation(fields: [namespaceId], references: [id], onDelete: Cascade)
  resourceRecord PolicyResource? @relation("PolicyRuleResource", fields: [resourceRecordId], references: [id], onDelete: Cascade)
  createdByStaff StaffUser?      @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([namespaceId, action, isActive])
  @@index([resourceRecordId, action, isActive])
  @@index([subjectType, subjectId])
  @@index([priority])
}

model UserPermissionOverride {
  id               String   @id @default(cuid())
  userId           String
  resourceRecordId String
  action           String
  effect           String
  reason           String?
  expiresAt        DateTime?
  createdByStaffId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  resource      PolicyResource @relation(fields: [resourceRecordId], references: [id], onDelete: Cascade)
  createdByStaff StaffUser?    @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([userId, action])
  @@index([resourceRecordId, action])
  @@index([expiresAt])
}

model PermissionBundle {
  id               String   @id @default(cuid())
  key              String   @unique
  label            String
  description      String?
  actions          String[]
  resourceTypes    String[]
  isSystemBundle   Boolean  @default(false)
  isActive         Boolean  @default(true)
  createdByStaffId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  createdByStaff StaffUser? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([isActive])
}

model PermissionDecisionLog {
  id               String   @id @default(cuid())
  userId           String?
  resourceType     String
  resourceId       String
  action           String
  decision         String
  source           String
  matchedRuleId    String?
  requestContext   Json?
  createdAt        DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([resourceType, resourceId, createdAt])
  @@index([action, decision, createdAt])
}
```

### 1.2 Feature Control Center Models

```prisma
model FeatureFlag {
  id               String   @id @default(cuid())
  key              String   @unique
  label            String
  description      String?
  category         String   @default("platform")
  defaultValue     Boolean  @default(false)
  isActive         Boolean  @default(true)
  killSwitch       Boolean  @default(false)
  createdByStaffId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  rules          FeatureRule[]
  audiences      FeatureAudience[]
  exposures      FeatureExposure[]
  auditLogs      FeatureFlagAuditLog[]
  createdByStaff StaffUser? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([category, isActive])
  @@index([killSwitch])
}

model FeatureAudience {
  id            String   @id @default(cuid())
  flagId        String
  key           String
  label         String
  roleScope     String[]
  countryScope  String[]
  platformScope String[]
  appVersions   String[]
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  flag FeatureFlag @relation(fields: [flagId], references: [id], onDelete: Cascade)
  rules FeatureRule[]

  @@unique([flagId, key])
  @@index([flagId])
}

model FeatureRule {
  id               String   @id @default(cuid())
  flagId           String
  audienceId       String?
  rolloutPercent   Int      @default(0)
  value            Boolean  @default(false)
  startAt          DateTime?
  endAt            DateTime?
  priority         Int      @default(100)
  isActive         Boolean  @default(true)
  conditions       Json?
  createdByStaffId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  flag           FeatureFlag      @relation(fields: [flagId], references: [id], onDelete: Cascade)
  audience       FeatureAudience? @relation(fields: [audienceId], references: [id], onDelete: SetNull)
  createdByStaff StaffUser?       @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([flagId, isActive, priority])
  @@index([audienceId])
}

model FeatureExposure {
  id           String   @id @default(cuid())
  flagId       String
  userId       String?
  sessionKey   String?
  variant      String?
  value        Boolean
  context      Json?
  exposedAt    DateTime @default(now())

  flag FeatureFlag @relation(fields: [flagId], references: [id], onDelete: Cascade)
  user User?       @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([flagId, exposedAt])
  @@index([userId, exposedAt])
  @@index([sessionKey, exposedAt])
}

model FeatureFlagAuditLog {
  id         String   @id @default(cuid())
  flagId      String
  staffId     String?
  action      String
  beforeState Json?
  afterState  Json?
  createdAt   DateTime @default(now())

  flag  FeatureFlag @relation(fields: [flagId], references: [id], onDelete: Cascade)
  staff StaffUser?  @relation(fields: [staffId], references: [id], onDelete: SetNull)

  @@index([flagId, createdAt])
  @@index([staffId, createdAt])
}
```

### 1.3 Moderation and Trust Additions

```prisma
model ContentPolicy {
  id               String   @id @default(cuid())
  key              String   @unique
  label            String
  scope            String
  severity         String   @default("medium")
  rules            Json
  actions          Json
  isActive         Boolean  @default(true)
  createdByStaffId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  createdByStaff StaffUser? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([scope, isActive])
}

model TrustProfile {
  id                 String   @id @default(cuid())
  userId             String   @unique
  trustScore         Float    @default(50)
  riskLevel          String   @default("medium")
  moderationStrikes  Int      @default(0)
  verifiedSignals    Json?
  lastEvaluatedAt    DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  riskSignals RiskSignal[]

  @@index([riskLevel, trustScore])
}

model RiskSignal {
  id             String   @id @default(cuid())
  userId         String
  trustProfileId String?
  signalType     String
  severity       String   @default("info")
  score          Float    @default(0)
  metadata       Json?
  createdAt      DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  trustProfile TrustProfile? @relation(fields: [trustProfileId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([signalType, createdAt])
}

model Appeal {
  id               String   @id @default(cuid())
  moderationCaseId String
  submittedByUserId String
  status           String   @default("open")
  reason           String
  resolutionNote   String?
  resolvedByStaffId String?
  resolvedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  moderationCase  ModerationCase @relation(fields: [moderationCaseId], references: [id], onDelete: Cascade)
  submittedByUser User           @relation(fields: [submittedByUserId], references: [id], onDelete: Cascade)
  resolvedByStaff StaffUser?     @relation(fields: [resolvedByStaffId], references: [id], onDelete: SetNull)

  @@index([moderationCaseId, status])
  @@index([submittedByUserId, createdAt])
}
```

### 1.4 Config and Rollback Foundations

```prisma
model ConfigSnapshot {
  id               String   @id @default(cuid())
  scope            String
  key              String
  label            String?
  payload          Json
  version          Int
  source           String   @default("admin")
  createdByStaffId String?
  createdAt        DateTime @default(now())

  createdByStaff StaffUser? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)
  changes        ConfigChange[]

  @@unique([scope, key, version])
  @@index([scope, key, createdAt])
}

model ConfigChange {
  id              String   @id @default(cuid())
  scope           String
  key             String
  beforeSnapshotId String?
  afterSnapshotId  String?
  action          String
  reason          String?
  createdByStaffId String?
  createdAt       DateTime @default(now())

  beforeSnapshot ConfigSnapshot? @relation("ConfigChangeBefore", fields: [beforeSnapshotId], references: [id], onDelete: SetNull)
  afterSnapshot  ConfigSnapshot? @relation("ConfigChangeAfter", fields: [afterSnapshotId], references: [id], onDelete: SetNull)
  createdByStaff StaffUser?      @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([scope, key, createdAt])
  @@index([action, createdAt])
}
```

## 2. Backend Route Skeleton Inventory

All routes mount under `router.use('/...')` in `geezle-backend/src/routes/admin/index.ts`.

### 2.1 New Admin Route Files

- `src/routes/admin/policies.routes.ts`
- `src/routes/admin/feature-control.routes.ts`
- `src/routes/admin/moderation-policies.routes.ts`
- `src/routes/admin/trust.routes.ts`
- `src/routes/admin/config.routes.ts`

### 2.2 New Controller Files

- `src/controllers/admin.policies.controller.ts`
- `src/controllers/admin.featureControl.controller.ts`
- `src/controllers/admin.moderationPolicies.controller.ts`
- `src/controllers/admin.trust.controller.ts`
- `src/controllers/admin.config.controller.ts`

### 2.3 New Service Files

- `src/services/policy.service.ts`
- `src/services/featureFlag.service.ts`
- `src/services/trust.service.ts`
- `src/services/configSnapshot.service.ts`

### 2.4 New Middleware Files

- `src/middleware/policy.middleware.ts`
- `src/middleware/flag.middleware.ts`

## 3. Admin API Endpoints

### 3.1 Policy Center

Routes in `policies.routes.ts`

- `GET /admin/policies/namespaces`
- `POST /admin/policies/namespaces`
- `PATCH /admin/policies/namespaces/:id`
- `GET /admin/policies/resources`
- `POST /admin/policies/resources`
- `GET /admin/policies/rules`
- `POST /admin/policies/rules`
- `PATCH /admin/policies/rules/:id`
- `DELETE /admin/policies/rules/:id`
- `GET /admin/policies/users/:userId/overrides`
- `POST /admin/policies/users/:userId/overrides`
- `DELETE /admin/policies/overrides/:id`
- `POST /admin/policies/evaluate`
- `GET /admin/policies/decision-logs`

Required permission keys:

- `policies.read`
- `policies.write`
- `policies.evaluate`
- `policies.overrides.manage`

### 3.2 Feature Control Center

Routes in `feature-control.routes.ts`

- `GET /admin/feature-control/flags`
- `POST /admin/feature-control/flags`
- `PATCH /admin/feature-control/flags/:id`
- `POST /admin/feature-control/flags/:id/kill-switch`
- `GET /admin/feature-control/flags/:id/audiences`
- `POST /admin/feature-control/flags/:id/audiences`
- `GET /admin/feature-control/flags/:id/rules`
- `POST /admin/feature-control/flags/:id/rules`
- `PATCH /admin/feature-control/rules/:id`
- `DELETE /admin/feature-control/rules/:id`
- `GET /admin/feature-control/exposures`
- `GET /admin/feature-control/audit`

Required permission keys:

- `feature_flags.read`
- `feature_flags.write`
- `feature_flags.kill_switch`
- `feature_flags.audit.read`

### 3.3 Moderation and Trust Center

Routes in `moderation-policies.routes.ts`

- `GET /admin/moderation-policies`
- `POST /admin/moderation-policies`
- `PATCH /admin/moderation-policies/:id`
- `GET /admin/moderation-policies/cases`
- `GET /admin/moderation-policies/appeals`
- `POST /admin/moderation-policies/appeals/:id/resolve`

Routes in `trust.routes.ts`

- `GET /admin/trust/users`
- `GET /admin/trust/users/:userId`
- `POST /admin/trust/users/:userId/recompute`
- `GET /admin/trust/signals`
- `POST /admin/trust/signals`

Required permission keys:

- `moderation.policies.read`
- `moderation.policies.write`
- `moderation.appeals.manage`
- `trust.read`
- `trust.write`

### 3.4 Config and Rollback Foundations

Routes in `config.routes.ts`

- `GET /admin/config/snapshots`
- `POST /admin/config/snapshots`
- `GET /admin/config/changes`
- `POST /admin/config/rollback`

Required permission keys:

- `config.read`
- `config.write`
- `config.rollback`

## 4. Service Responsibilities

### 4.1 `policy.service.ts`

- normalize namespaces, resources, and rule payloads
- evaluate user action against:
  - system staff role permissions
  - policy rules
  - per-user overrides
  - resource visibility defaults
- write `PermissionDecisionLog`
- emit socket/admin browser events after mutations

Core methods:

- `listNamespaces()`
- `createNamespace()`
- `listResources()`
- `upsertResource()`
- `listRules()`
- `createRule()`
- `updateRule()`
- `deleteRule()`
- `listUserOverrides(userId)`
- `createUserOverride()`
- `deleteUserOverride()`
- `evaluateDecision(input)`

### 4.2 `featureFlag.service.ts`

- compute effective value by:
  - flag default
  - kill switch
  - active rules by priority
  - audience match
  - rollout percentage
- log `FeatureExposure`
- write `FeatureFlagAuditLog`

Core methods:

- `listFlags()`
- `createFlag()`
- `updateFlag()`
- `toggleKillSwitch()`
- `listAudiences(flagId)`
- `createAudience()`
- `listRules(flagId)`
- `createRule()`
- `updateRule()`
- `deleteRule()`
- `resolveFlagContext(input)`

### 4.3 `trust.service.ts`

- compute user trust profile from:
  - moderation cases
  - account violations
  - KYC status
  - appeals outcome
  - admin-reviewed signals

Core methods:

- `listTrustProfiles()`
- `getTrustProfile(userId)`
- `createRiskSignal()`
- `recomputeTrustProfile(userId)`

### 4.4 `configSnapshot.service.ts`

- create snapshot before risky admin mutations
- create diffable snapshot versions
- rollback selected config scope/key

Core methods:

- `createSnapshot(scope, key, payload, staffId)`
- `listSnapshots(scope, key)`
- `recordChange(input)`
- `rollbackToVersion(scope, key, version, staffId)`

## 5. Frontend Admin Pages

Add to `C:\Projects\geezle\src\dashboard\admin`:

- `PolicyCenter.tsx`
- `UserPermissions.tsx`
- `ResourcePolicies.tsx`
- `FeatureControl.tsx`
- `KillSwitches.tsx`
- `ModerationPolicies.tsx`
- `TrustSignals.tsx`
- `ConfigRollback.tsx`

### 5.1 Admin Page Responsibilities

`PolicyCenter.tsx`

- namespace list
- rule builder
- evaluation sandbox
- recent decision logs

`UserPermissions.tsx`

- search user
- list active overrides
- add/remove override

`ResourcePolicies.tsx`

- browse policies by resource type
- visibility presets
- inheritance mode controls

`FeatureControl.tsx`

- flag list
- audience builder
- rollout percentage slider
- environment and platform filters

`KillSwitches.tsx`

- one-click disable for risky features
- recent exposures and flag audit logs

`ModerationPolicies.tsx`

- policy definitions
- case queues
- appeals queue

`TrustSignals.tsx`

- trust profile summary
- manual risk signals
- recompute controls

`ConfigRollback.tsx`

- config snapshots
- diff viewer
- rollback action

## 6. Frontend User Pages

Add user-facing pages under settings/profile flow:

- `src/pages/settings/PrivacyPermissions.tsx`
- `src/pages/settings/SafetyControls.tsx`
- `src/pages/settings/NotificationPreferences.tsx`

Phase 1 user controls:

- who can message me
- who can comment on my content
- who can tag/mention me
- who can view/download my files
- default visibility for posts/profile/media
- blocked users and muted users

## 7. Admin Service Additions

Extend `C:\Projects\geezle\src\services\admin.ts` with:

- `getPolicyNamespaces`
- `createPolicyNamespace`
- `getPolicyResources`
- `upsertPolicyResource`
- `getPolicyRules`
- `createPolicyRule`
- `updatePolicyRule`
- `deletePolicyRule`
- `evaluatePolicyDecision`
- `getUserPermissionOverrides`
- `createUserPermissionOverride`
- `deleteUserPermissionOverride`
- `getFeatureFlags`
- `createFeatureFlag`
- `updateFeatureFlag`
- `toggleFeatureKillSwitch`
- `getFeatureAudiences`
- `createFeatureAudience`
- `getFeatureRules`
- `createFeatureRule`
- `updateFeatureRule`
- `deleteFeatureRule`
- `getFeatureExposures`
- `getFeatureFlagAudit`
- `getContentPolicies`
- `createContentPolicy`
- `updateContentPolicy`
- `getTrustProfiles`
- `getTrustProfile`
- `createRiskSignal`
- `recomputeTrustProfile`
- `getConfigSnapshots`
- `createConfigSnapshot`
- `rollbackConfig`

## 8. Realtime Events

Add to backend emitters and forward in `SocketContext.tsx`:

- `policy:updated`
- `permissions:user_updated`
- `feature_flags:updated`
- `feature_flags:kill_switch_toggled`
- `moderation:policy_updated`
- `trust:profile_updated`
- `config:snapshot_created`
- `config:rollback_completed`

These should follow the current window-forwarding pattern already used in `SocketContext.tsx`.

## 9. Phase 1 Flag Keys

Create these flags on first seed:

- `control_plane_enabled`
- `policy_center_enabled`
- `user_permission_overrides_enabled`
- `feature_control_center_enabled`
- `kill_switches_enabled`
- `trust_center_enabled`
- `appeals_enabled`
- `config_rollback_enabled`

All default to `false` in production.

## 10. Seed Updates

Extend the RBAC seed path to create new staff permissions:

- `policies.read`
- `policies.write`
- `policies.evaluate`
- `policies.overrides.manage`
- `feature_flags.read`
- `feature_flags.write`
- `feature_flags.kill_switch`
- `feature_flags.audit.read`
- `moderation.policies.read`
- `moderation.policies.write`
- `moderation.appeals.manage`
- `trust.read`
- `trust.write`
- `config.read`
- `config.write`
- `config.rollback`

## 11. Rollout Order

1. schema migration only
2. seed new staff permissions and disabled feature flags
3. backend route/controller/service skeletons
4. admin service methods
5. admin page shells
6. socket forwarding for new events
7. policy evaluation for one low-risk resource type first:
   - `community_post`
8. user permission settings page
9. trust profile read-only dashboard
10. config snapshot and rollback for homepage settings only

## 12. Non-Regression Rules

- Do not replace current staff RBAC. Layer Policy Center on top of it.
- Do not change existing auth token flow in `UserContext.tsx`.
- Do not change wallet, payouts, KYC admin approval, or payment route behavior.
- Do not mutate existing socket event names.
- For Phase 1, only apply policy enforcement to:
  - community posts
  - profile visibility
  - file download/view
- leave messages, contracts, wallet, and payout enforcement unchanged until Phase 2

## 13. Acceptance Criteria

- Admin can create a policy namespace and rule from the dashboard
- Admin can grant or revoke a user-specific permission override
- Frontend can resolve native feature flags without breaking current pages
- Admin can enable a kill switch and see it propagate in realtime
- Admin can view trust profiles and add risk signals
- Admin can create config snapshots and rollback homepage settings
- All Phase 1 features remain disabled by default in production
- Existing production flows continue to pass:
  - login
  - posts
  - search
  - messaging
  - wallet
  - KYC
  - admin dashboard

## 14. Next Step

After this spec, implement only the following first:

1. Prisma migration for Phase 1 models
2. RBAC seed update for new permission keys
3. `policies.routes.ts`
4. `policy.service.ts`
5. `PolicyCenter.tsx`
6. `admin.ts` Policy Center methods

That gives Scrolith a real native control plane entry point without touching payments, KYC, or finance.
