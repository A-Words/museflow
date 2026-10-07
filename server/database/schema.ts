import { sql } from 'drizzle-orm'
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const id = () => uuid('id').defaultRandom().primaryKey()
const createdAt = () => time('created_at').defaultNow().notNull()
const updatedAt = () => time('updated_at').defaultNow().notNull()

// Better Auth 1.7 core tables. Property names are the adapter's field names;
// physical names follow the repository's snake_case convention.
export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  role: varchar('role', { length: 16 }).default('creator').notNull(),
  status: varchar('status', { length: 16 }).default('active').notNull(),
  personalizationEnabled: boolean('personalization_enabled').default(true).notNull(),
}, t => [check('users_role_check', sql`${t.role} in ('creator', 'admin')`), check('users_status_check', sql`${t.status} in ('active', 'disabled')`)])

export const session = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: time('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [index('sessions_user_id_idx').on(t.userId)])

export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: time('access_token_expires_at'),
  refreshTokenExpiresAt: time('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [index('accounts_user_id_idx').on(t.userId), uniqueIndex('accounts_provider_identity_uq').on(t.providerId, t.accountId)])

export const verification = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [index('verifications_identifier_idx').on(t.identifier)])

export const authSchema = { user, session, account, verification }

export const conversations = pgTable('conversations', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(), status: varchar('status', { length: 24 }).default('active').notNull(),
  version: integer('version').default(1).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index('conversations_owner_date_idx').on(t.ownerId, t.createdAt, t.id), unique('conversations_id_owner_uq').on(t.id, t.ownerId)])

export const messages = pgTable('messages', {
  id: id(), conversationId: uuid('conversation_id').notNull(), ownerId: text('owner_id').notNull(),
  role: varchar('role', { length: 24 }).notNull(), parts: jsonb('parts').notNull(), metadata: jsonb('metadata'),
  schemaVersion: integer('schema_version').default(1).notNull(), status: varchar('status', { length: 24 }).notNull(),
  clientMessageId: text('client_message_id'), requestId: text('request_id').notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index('messages_order_idx').on(t.conversationId, t.createdAt, t.id),
  uniqueIndex('messages_client_dedupe_uq').on(t.ownerId, t.conversationId, t.clientMessageId),
  check('messages_schema_version_check', sql`${t.schemaVersion} > 0`),
  foreignKey({ name: 'messages_conversation_owner_fk', columns: [t.conversationId, t.ownerId], foreignColumns: [conversations.id, conversations.ownerId] }).onDelete('restrict'),
])

export const toolCalls = pgTable('tool_calls', {
  id: id(), ownerId: text('owner_id').notNull(), conversationId: uuid('conversation_id').notNull(),
  toolName: varchar('tool_name', { length: 80 }).notNull(), inputSnapshot: jsonb('input_snapshot').notNull(),
  inputHash: varchar('input_hash', { length: 128 }).notNull(), status: varchar('status', { length: 24 }).notNull(),
  confirmedAt: time('confirmed_at'), version: integer('version').default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index('tool_calls_owner_conversation_idx').on(t.ownerId, t.conversationId), unique('tool_calls_id_owner_uq').on(t.id, t.ownerId), unique('tool_calls_id_owner_conversation_uq').on(t.id, t.ownerId, t.conversationId), foreignKey({ name: 'tool_calls_conversation_owner_fk', columns: [t.conversationId, t.ownerId], foreignColumns: [conversations.id, conversations.ownerId] }).onDelete('restrict')])

export const providerConfigs = pgTable('provider_configs', {
  id: id(), providerKey: varchar('provider_key', { length: 80 }).notNull(), version: integer('version').notNull(),
  kind: varchar('kind', { length: 16 }).notNull(), adapterId: varchar('adapter_id', { length: 80 }).notNull(),
  modelId: varchar('model_id', { length: 160 }).notNull(), baseUrl: text('base_url'),
  credentialRef: text('credential_ref').notNull(), capabilities: jsonb('capabilities').notNull(),
  parameterMapping: jsonb('parameter_mapping').notNull(), sourceMode: varchar('source_mode', { length: 16 }).notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  createdAt: createdAt(),
}, t => [uniqueIndex('provider_configs_key_version_uq').on(t.providerKey, t.version), unique('provider_configs_id_kind_uq').on(t.id, t.kind), unique('provider_configs_id_kind_version_uq').on(t.id, t.kind, t.version), check('provider_configs_kind_check', sql`${t.kind} in ('text','music','tts')`), check('provider_configs_source_check', sql`${t.sourceMode} in ('mock','real')`), check('provider_configs_version_check', sql`${t.version} > 0`)])

export const providerDefaults = pgTable('provider_defaults', {
  kind: varchar('kind', { length: 16 }).primaryKey(), providerConfigId: uuid('provider_config_id').notNull().references(() => providerConfigs.id, { onDelete: 'restrict' }),
  version: integer('version').default(1).notNull(), updatedAt: updatedAt(),
}, t => [check('provider_defaults_kind_check', sql`${t.kind} in ('text','music','tts')`), foreignKey({ name: 'provider_defaults_config_kind_version_fk', columns: [t.providerConfigId, t.kind, t.version], foreignColumns: [providerConfigs.id, providerConfigs.kind, providerConfigs.version] }).onDelete('restrict')])

export const toolConfigs = pgTable('tool_configs', {
  id: id(), toolName: varchar('tool_name', { length: 80 }).notNull(), version: integer('version').notNull(),
  enabled: boolean('enabled').default(false).notNull(), inputSchemaVersion: integer('input_schema_version').notNull(),
  capabilities: jsonb('capabilities').notNull(), providerKind: varchar('provider_kind', { length: 16 }).notNull(),
  providerRef: uuid('provider_ref').references(() => providerConfigs.id, { onDelete: 'restrict' }), createdAt: createdAt(),
}, t => [uniqueIndex('tool_configs_name_version_uq').on(t.toolName, t.version), check('tool_configs_kind_check', sql`${t.providerKind} in ('text','music','tts')`), foreignKey({ name: 'tool_configs_provider_kind_fk', columns: [t.providerRef, t.providerKind], foreignColumns: [providerConfigs.id, providerConfigs.kind] }).onDelete('restrict')])

export const priceRules = pgTable('price_rules', {
  id: id(), toolName: varchar('tool_name', { length: 80 }).notNull(), version: integer('version').notNull(),
  currency: varchar('currency', { length: 24 }).notNull(), specification: jsonb('specification').notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(), activeFrom: time('active_from').notNull(), createdAt: createdAt(),
}, t => [uniqueIndex('price_rules_tool_version_uq').on(t.toolName, t.version), check('price_rules_amount_check', sql`${t.amount} >= 0`), check('price_rules_currency_check', sql`${t.currency} in ('creation','voice')`)])

export const quotes = pgTable('quotes', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  toolCallId: uuid('tool_call_id').notNull().references(() => toolCalls.id, { onDelete: 'restrict' }),
  inputHash: varchar('input_hash', { length: 128 }).notNull(), inputSnapshot: jsonb('input_snapshot').notNull(),
  providerSnapshot: jsonb('provider_snapshot').notNull(), capabilitySnapshot: jsonb('capability_snapshot').notNull(),
  priceVersion: integer('price_version').notNull(), currency: varchar('currency', { length: 24 }).notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(), expiresAt: time('expires_at').notNull(), createdAt: createdAt(),
}, t => [index('quotes_owner_idx').on(t.ownerId), unique('quotes_id_owner_tool_call_uq').on(t.id, t.ownerId, t.toolCallId), foreignKey({ name: 'quotes_tool_call_owner_fk', columns: [t.toolCallId, t.ownerId], foreignColumns: [toolCalls.id, toolCalls.ownerId] }).onDelete('restrict'), check('quotes_amount_check', sql`${t.amount} >= 0`), check('quotes_currency_check', sql`${t.currency} in ('creation','voice')`)])

export const generationTasks = pgTable('generation_tasks', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'restrict' }),
  toolCallId: uuid('tool_call_id').notNull().references(() => toolCalls.id, { onDelete: 'restrict' }),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'restrict' }).unique(),
  toolName: varchar('tool_name', { length: 80 }).notNull(), status: varchar('status', { length: 32 }).notNull(),
  sourceMode: varchar('source_mode', { length: 16 }).notNull(), inputSnapshot: jsonb('input_snapshot').notNull(),
  providerSnapshot: jsonb('provider_snapshot').notNull(), entitlementSnapshot: jsonb('entitlement_snapshot').notNull(),
  retryOfTaskId: uuid('retry_of_task_id'), errorCode: varchar('error_code', { length: 80 }),
  version: integer('version').default(1).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index('generation_tasks_status_date_idx').on(t.status, t.createdAt, t.id), index('generation_tasks_owner_date_idx').on(t.ownerId, t.createdAt, t.id), unique('generation_tasks_id_owner_uq').on(t.id, t.ownerId), foreignKey({ name: 'generation_tasks_conversation_owner_fk', columns: [t.conversationId, t.ownerId], foreignColumns: [conversations.id, conversations.ownerId] }).onDelete('restrict'), foreignKey({ name: 'generation_tasks_tool_call_owner_conversation_fk', columns: [t.toolCallId, t.ownerId, t.conversationId], foreignColumns: [toolCalls.id, toolCalls.ownerId, toolCalls.conversationId] }).onDelete('restrict'), foreignKey({ name: 'generation_tasks_quote_owner_tool_call_fk', columns: [t.quoteId, t.ownerId, t.toolCallId], foreignColumns: [quotes.id, quotes.ownerId, quotes.toolCallId] }).onDelete('restrict'), foreignKey({ name: 'generation_tasks_retry_owner_fk', columns: [t.retryOfTaskId, t.ownerId], foreignColumns: [t.id, t.ownerId] }).onDelete('restrict'), check('generation_tasks_source_check', sql`${t.sourceMode} in ('mock','real','manual')`)])

export const taskAttempts = pgTable('task_attempts', {
  id: id(), taskId: uuid('task_id').notNull().references(() => generationTasks.id, { onDelete: 'restrict' }),
  attemptNo: integer('attempt_no').notNull(), dispatchPhase: varchar('dispatch_phase', { length: 32 }).notNull(),
  providerRequestKey: text('provider_request_key').notNull(), providerRequestId: text('provider_request_id'),
  providerStatus: varchar('provider_status', { length: 32 }), startedAt: time('started_at').defaultNow().notNull(), finishedAt: time('finished_at'),
}, t => [uniqueIndex('task_attempts_task_no_uq').on(t.taskId, t.attemptNo), uniqueIndex('task_attempts_provider_key_uq').on(t.providerRequestKey), check('task_attempts_no_check', sql`${t.attemptNo} > 0`)])

export const taskEvents = pgTable('task_events', {
  id: id(), taskId: uuid('task_id').notNull().references(() => generationTasks.id, { onDelete: 'restrict' }),
  eventKey: text('event_key').notNull().unique(), fromStatus: varchar('from_status', { length: 32 }),
  toStatus: varchar('to_status', { length: 32 }).notNull(), actor: text('actor').notNull(),
  evidenceRef: text('evidence_ref'), createdAt: createdAt(),
}, t => [index('task_events_task_date_idx').on(t.taskId, t.createdAt)])

export const assets = pgTable('assets', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').references(() => generationTasks.id, { onDelete: 'restrict' }), outputSlot: varchar('output_slot', { length: 80 }),
  kind: varchar('kind', { length: 24 }).notNull(), title: varchar('title', { length: 200 }).notNull(),
  storageKey: text('storage_key'), textContent: text('text_content'), mimeType: varchar('mime_type', { length: 120 }),
  bytes: bigint('bytes', { mode: 'bigint' }), durationMs: integer('duration_ms'), checksum: text('checksum'),
  tags: jsonb('tags').default([]).notNull(), sourceMode: varchar('source_mode', { length: 16 }).notNull(),
  parentAssetId: uuid('parent_asset_id'), coverAssetId: uuid('cover_asset_id'), status: varchar('status', { length: 32 }).notNull(),
  deletedAt: time('deleted_at'), version: integer('version').default(1).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index('assets_owner_date_idx').on(t.ownerId, t.createdAt, t.id), uniqueIndex('assets_task_slot_uq').on(t.taskId, t.outputSlot), unique('assets_id_owner_uq').on(t.id, t.ownerId), foreignKey({ name: 'assets_task_owner_fk', columns: [t.taskId, t.ownerId], foreignColumns: [generationTasks.id, generationTasks.ownerId] }).onDelete('restrict'), foreignKey({ name: 'assets_parent_owner_fk', columns: [t.parentAssetId, t.ownerId], foreignColumns: [t.id, t.ownerId] }).onDelete('restrict'), foreignKey({ name: 'assets_cover_owner_fk', columns: [t.coverAssetId, t.ownerId], foreignColumns: [t.id, t.ownerId] }).onDelete('restrict'), check('assets_task_slot_check', sql`${t.taskId} is null or ${t.outputSlot} is not null`), check('assets_source_check', sql`${t.sourceMode} in ('mock','real','manual')`), check('assets_bytes_check', sql`${t.bytes} is null or ${t.bytes} >= 0`), check('assets_duration_check', sql`${t.durationMs} is null or ${t.durationMs} >= 0`)])

export const creditAccounts = pgTable('credit_accounts', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  currency: varchar('currency', { length: 24 }).notNull(), available: bigint('available', { mode: 'bigint' }).default(sql`0`).notNull(),
  held: bigint('held', { mode: 'bigint' }).default(sql`0`).notNull(), version: integer('version').default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex('credit_accounts_owner_currency_uq').on(t.ownerId, t.currency), unique('credit_accounts_id_owner_uq').on(t.id, t.ownerId), check('credit_accounts_available_check', sql`${t.available} >= 0`), check('credit_accounts_held_check', sql`${t.held} >= 0`), check('credit_accounts_currency_check', sql`${t.currency} in ('creation','voice')`)])

export const creditReservations = pgTable('credit_reservations', {
  id: id(), taskId: uuid('task_id').notNull().references(() => generationTasks.id, { onDelete: 'restrict' }).unique(),
  ownerId: text('owner_id').notNull(),
  accountId: uuid('account_id').notNull().references(() => creditAccounts.id, { onDelete: 'restrict' }),
  amount: bigint('amount', { mode: 'bigint' }).notNull(), state: varchar('state', { length: 16 }).default('held').notNull(),
  finalizedAt: time('finalized_at'), createdAt: createdAt(),
}, t => [unique('credit_reservations_id_owner_uq').on(t.id, t.ownerId), foreignKey({ name: 'credit_reservations_task_owner_fk', columns: [t.taskId, t.ownerId], foreignColumns: [generationTasks.id, generationTasks.ownerId] }).onDelete('restrict'), foreignKey({ name: 'credit_reservations_account_owner_fk', columns: [t.accountId, t.ownerId], foreignColumns: [creditAccounts.id, creditAccounts.ownerId] }).onDelete('restrict'), check('credit_reservations_amount_check', sql`${t.amount} > 0`), check('credit_reservations_state_check', sql`${t.state} in ('held','captured','released')`)])

export const creditEntries = pgTable('credit_entries', {
  id: id(), ownerId: text('owner_id').notNull(), accountId: uuid('account_id').notNull().references(() => creditAccounts.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').references(() => generationTasks.id, { onDelete: 'restrict' }),
  reservationId: uuid('reservation_id').references(() => creditReservations.id, { onDelete: 'restrict' }),
  kind: varchar('kind', { length: 32 }).notNull(), availableDelta: bigint('available_delta', { mode: 'bigint' }).notNull(),
  heldDelta: bigint('held_delta', { mode: 'bigint' }).notNull(), operationKey: text('operation_key').notNull().unique(),
  operatorId: text('operator_id').references(() => user.id, { onDelete: 'restrict' }), reason: text('reason'), createdAt: createdAt(),
}, t => [index('credit_entries_account_date_idx').on(t.accountId, t.createdAt, t.id), foreignKey({ name: 'credit_entries_account_owner_fk', columns: [t.accountId, t.ownerId], foreignColumns: [creditAccounts.id, creditAccounts.ownerId] }).onDelete('restrict'), foreignKey({ name: 'credit_entries_task_owner_fk', columns: [t.taskId, t.ownerId], foreignColumns: [generationTasks.id, generationTasks.ownerId] }).onDelete('restrict'), foreignKey({ name: 'credit_entries_reservation_owner_fk', columns: [t.reservationId, t.ownerId], foreignColumns: [creditReservations.id, creditReservations.ownerId] }).onDelete('restrict')])

export const idempotencyRecords = pgTable('idempotency_records', {
  id: id(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  operation: varchar('operation', { length: 80 }).notNull(), key: text('key').notNull(), requestHash: varchar('request_hash', { length: 128 }).notNull(),
  resourceId: text('resource_id').notNull(), responseSnapshot: jsonb('response_snapshot').notNull(), createdAt: createdAt(),
}, t => [uniqueIndex('idempotency_owner_operation_key_uq').on(t.ownerId, t.operation, t.key)])

export const auditLogs = pgTable('audit_logs', {
  id: id(), actorId: text('actor_id').references(() => user.id, { onDelete: 'restrict' }), action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(), targetId: text('target_id').notNull(), reason: text('reason'),
  changeSummary: jsonb('change_summary').notNull(), requestId: text('request_id').notNull(), createdAt: createdAt(),
}, t => [index('audit_logs_target_idx').on(t.targetType, t.targetId, t.createdAt)])
