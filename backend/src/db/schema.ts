import {
  mysqlTable,
  int,
  bigint,
  char,
  varchar,
  tinyint,
  datetime,
  time,
  text,
  index,
  uniqueIndex,
  foreignKey
} from "drizzle-orm/mysql-core";

// ── lookup tables ─────────────────────────────────────────────────────────────

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique()
});

export const userStatuses = mysqlTable("user_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique()
});

export const organizationStatuses = mysqlTable("organization_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique()
});

export const denyReasons = mysqlTable("deny_reasons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  message: varchar("message", { length: 255 }).notNull()
});

export const auditActions = mysqlTable("audit_actions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 80 }).notNull().unique()
});

export const auditEntities = mysqlTable("audit_entities", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique()
});

// ── organizations ─────────────────────────────────────────────────────────────

export const organizations = mysqlTable(
  "organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull().unique(),
    statusId: int("status_id").notNull(),
    createdAtUtc: datetime("created_at_utc").notNull(),
    updatedAtUtc: datetime("updated_at_utc").notNull()
  },
  (t) => ({
    fkOrgStatus: foreignKey({
      name: "fk_org_status",
      columns: [t.statusId],
      foreignColumns: [organizationStatuses.id]
    })
  })
);

// ── users ─────────────────────────────────────────────────────────────────────

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    username: varchar("username", { length: 120 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    organizationId: int("organization_id").notNull(),
    roleId: int("role_id").notNull(),
    statusId: int("status_id").notNull(),
    createdAtUtc: datetime("created_at_utc").notNull(),
    updatedAtUtc: datetime("updated_at_utc").notNull()
  },
  (t) => ({
    fkUserOrg: foreignKey({
      name: "fk_user_org",
      columns: [t.organizationId],
      foreignColumns: [organizations.id]
    }),
    fkUserRole: foreignKey({
      name: "fk_user_role",
      columns: [t.roleId],
      foreignColumns: [roles.id]
    }),
    fkUserStatus: foreignKey({
      name: "fk_user_status",
      columns: [t.statusId],
      foreignColumns: [userStatuses.id]
    })
  })
);

// ── sessions ──────────────────────────────────────────────────────────────────

export const sessions = mysqlTable(
  "sessions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sessionTokenHash: char("session_token_hash", { length: 64 }).notNull(),
    userId: int("user_id").notNull(),
    createdAtUtc: datetime("created_at_utc").notNull(),
    lastActivityUtc: datetime("last_activity_utc").notNull(),
    expiresAtUtc: datetime("expires_at_utc").notNull(),
    revokedAtUtc: datetime("revoked_at_utc"),
    userAgent: varchar("user_agent", { length: 255 }),
    clientIp: varchar("client_ip", { length: 64 })
  },
  (t) => ({
    uqSessionHash: uniqueIndex("uq_session_hash").on(t.sessionTokenHash),
    idxSessionUser: index("idx_session_user").on(t.userId),
    idxSessionLastActivity: index("idx_session_last_activity").on(t.lastActivityUtc),
    fkSessionUser: foreignKey({
      name: "fk_session_user",
      columns: [t.userId],
      foreignColumns: [users.id]
    })
  })
);

// ── api_definitions ───────────────────────────────────────────────────────────

export const apiDefinitions = mysqlTable(
  "api_definitions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    basePath: varchar("base_path", { length: 200 }).notNull(),
    targetUrl: varchar("target_url", { length: 500 }).notNull(),
    isPublic: tinyint("is_public").notNull().default(0),
    isEnabled: tinyint("is_enabled").notNull().default(1),
    alwaysOn: tinyint("always_on").notNull().default(0),
    createdAtUtc: datetime("created_at_utc").notNull(),
    updatedAtUtc: datetime("updated_at_utc").notNull()
  },
  (t) => ({
    idxApiOrg: index("idx_api_org").on(t.organizationId),
    uqApiBasePath: uniqueIndex("uq_api_base_path").on(t.basePath),
    fkApiOrg: foreignKey({
      name: "fk_api_org",
      columns: [t.organizationId],
      foreignColumns: [organizations.id]
    })
  })
);

// ── user_api_permissions ──────────────────────────────────────────────────────

export const userApiPermissions = mysqlTable(
  "user_api_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    apiId: int("api_id").notNull(),
    createdAtUtc: datetime("created_at_utc").notNull()
  },
  (t) => ({
    uqUserApi: uniqueIndex("uq_user_api").on(t.userId, t.apiId),
    fkPermUser: foreignKey({
      name: "fk_perm_user",
      columns: [t.userId],
      foreignColumns: [users.id]
    }),
    fkPermApi: foreignKey({
      name: "fk_perm_api",
      columns: [t.apiId],
      foreignColumns: [apiDefinitions.id]
    })
  })
);

// ── access_windows ────────────────────────────────────────────────────────────

export const accessWindows = mysqlTable(
  "access_windows",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectType: varchar("subject_type", { length: 10 }).notNull(),
    subjectId: int("subject_id").notNull(),
    dayOfWeek: tinyint("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isActive: tinyint("is_active").notNull().default(1),
    createdAtUtc: datetime("created_at_utc").notNull()
  },
  (t) => ({
    idxWindowsSubject: index("idx_windows_subject").on(t.subjectType, t.subjectId)
  })
);

// ── access_logs ───────────────────────────────────────────────────────────────

export const accessLogs = mysqlTable(
  "access_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull(),
    userId: int("user_id"),
    apiId: int("api_id").notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    status: int("status").notNull(),
    requestBytes: int("request_bytes").notNull().default(0),
    responseBytes: int("response_bytes").notNull().default(0),
    responseHeaderBytes: int("response_header_bytes").notNull().default(0),
    durationMs: int("duration_ms").notNull().default(0),
    clientIp: varchar("client_ip", { length: 64 }).notNull(),
    denyReasonId: int("deny_reason_id"),
    createdAtUtc: datetime("created_at_utc").notNull()
  },
  (t) => ({
    idxAccessOrgTime: index("idx_access_org_time").on(t.organizationId, t.createdAtUtc),
    idxAccessUserTime: index("idx_access_user_time").on(t.userId, t.createdAtUtc),
    idxAccessTime: index("idx_access_time").on(t.createdAtUtc),
    fkAccessOrg: foreignKey({
      name: "fk_access_org",
      columns: [t.organizationId],
      foreignColumns: [organizations.id]
    }),
    fkAccessUser: foreignKey({
      name: "fk_access_user",
      columns: [t.userId],
      foreignColumns: [users.id]
    }),
    fkAccessApi: foreignKey({
      name: "fk_access_api",
      columns: [t.apiId],
      foreignColumns: [apiDefinitions.id]
    }),
    fkAccessReason: foreignKey({
      name: "fk_access_reason",
      columns: [t.denyReasonId],
      foreignColumns: [denyReasons.id]
    })
  })
);

// ── audit_logs ────────────────────────────────────────────────────────────────

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull(),
    userId: int("user_id").notNull(),
    actionId: int("action_id").notNull(),
    entityId: int("entity_id").notNull(),
    metadataJson: text("metadata_json").notNull(),
    createdAtUtc: datetime("created_at_utc").notNull()
  },
  (t) => ({
    idxAuditOrg: index("idx_audit_org").on(t.organizationId),
    fkAuditOrg: foreignKey({
      name: "fk_audit_org",
      columns: [t.organizationId],
      foreignColumns: [organizations.id]
    }),
    fkAuditUser: foreignKey({
      name: "fk_audit_user",
      columns: [t.userId],
      foreignColumns: [users.id]
    }),
    fkAuditAction: foreignKey({
      name: "fk_audit_action",
      columns: [t.actionId],
      foreignColumns: [auditActions.id]
    }),
    fkAuditEntity: foreignKey({
      name: "fk_audit_entity",
      columns: [t.entityId],
      foreignColumns: [auditEntities.id]
    })
  })
);
