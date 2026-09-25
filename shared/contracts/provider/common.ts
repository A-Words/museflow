import { z } from 'zod'

// Internal port primitives shared by the text, music and speech providers.
// Adapters validate every vendor response against these schemas; business modules
// read the normalized result only, never a vendor payload. See docs/PROVIDER_CONTRACT.md.

export const providerKindSchema = z.enum(['text', 'music', 'tts'])
export type ProviderKind = z.infer<typeof providerKindSchema>

// A mock adapter must never be reported as a real provider result.
export const sourceModeSchema = z.enum(['real', 'mock'])
export type SourceMode = z.infer<typeof sourceModeSchema>

// sync: result returned by the call itself. stream: incremental events. async: accepted
// request that is completed through query/callback.
export const invocationModeSchema = z.enum(['sync', 'stream', 'async'])
export type InvocationMode = z.infer<typeof invocationModeSchema>

export const textOperationSchema = z.enum(['generate', 'stream'])
export const musicOperationSchema = z.enum(['submit', 'query', 'cancel'])
export const speechOperationSchema = z.enum(['synthesize', 'query', 'cancel'])
export type TextOperation = z.infer<typeof textOperationSchema>
export type MusicOperation = z.infer<typeof musicOperationSchema>
export type SpeechOperation = z.infer<typeof speechOperationSchema>

export const operationsByKind = {
  text: textOperationSchema.options,
  music: musicOperationSchema.options,
  tts: speechOperationSchema.options,
} as const

// Provider output only ever produces lyrics, audio or a voice sample. The assets dictionary
// additionally defines `cover`, which comes from a user upload (POST /assets) instead of a
// provider, so it is deliberately absent here.
export const providerArtifactKindSchema = z.enum(['lyrics', 'audio', 'voice_sample'])
export type ProviderArtifactKind = z.infer<typeof providerArtifactKindSchema>

// Download URLs are controlled provider addresses. The caller must re-validate host,
// redirects, content type and size before downloading; a URL alone is never success.
export const providerArtifactSchema = z.strictObject({
  kind: providerArtifactKindSchema,
  mimeType: z.string().min(1).optional(),
  format: z.string().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  downloadUrl: z.url().optional(),
  downloadUrlExpiresAt: z.iso.datetime().optional(),
})
export type ProviderArtifact = z.infer<typeof providerArtifactSchema>

export const providerUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  characters: z.number().int().nonnegative().optional(),
  audioMs: z.number().int().nonnegative().optional(),
  estimatedCostMicros: z.number().int().nonnegative().optional(),
})
export type ProviderUsage = z.infer<typeof providerUsageSchema>

// ---------------------------------------------------------------------------
// Capability declaration
// ---------------------------------------------------------------------------

export const providerOutputTypeSchema = z.enum(['text', 'structured', 'tool-calls', 'audio', 'voice-sample'])
export const providerVoiceKindSchema = z.enum(['preset', 'cloned'])

export const providerCapabilitiesSchema = z
  .strictObject({
    kind: providerKindSchema,
    operations: z.array(z.string().min(1)).min(1),
    modes: z.array(invocationModeSchema).min(1),
    outputTypes: z.array(providerOutputTypeSchema).min(1),
    supports: z.strictObject({
      query: z.boolean(),
      cancel: z.boolean(),
      // Stable request key deduplicates a re-submitted generation on the vendor side.
      idempotentSubmit: z.boolean(),
      callbacks: z.boolean(),
      remoteDelete: z.boolean(),
    }),
    limits: z.strictObject({
      maxInputCharacters: z.number().int().positive().optional(),
      maxDurationSeconds: z.number().int().positive().optional(),
      maxOutputBytes: z.number().int().positive().optional(),
      audioFormats: z.array(z.string().min(1)).optional(),
      languages: z.array(z.string().min(1)).optional(),
      voiceKinds: z.array(providerVoiceKindSchema).optional(),
      // Longest expected wait before a task may move to reconciling.
      expectedCompletionSeconds: z.number().int().positive().optional(),
    }),
  })
  .superRefine((value, context) => {
    const allowed: readonly string[] = operationsByKind[value.kind]
    for (const operation of value.operations) {
      if (!allowed.includes(operation)) {
        context.addIssue({
          code: 'custom',
          path: ['operations'],
          message: `Operation "${operation}" does not belong to the ${value.kind} port`,
        })
      }
    }
    // An asynchronous port whose result can be neither queried nor delivered by callback
    // could never be recovered, so it must not be published as a usable configuration.
    if (value.modes.includes('async') && !value.supports.query && !value.supports.callbacks) {
      context.addIssue({
        code: 'custom',
        path: ['supports', 'query'],
        message: 'An asynchronous port must declare query or callback support; otherwise its result can never be recovered',
      })
    }
  })
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>

// ---------------------------------------------------------------------------
// Immutable configuration versions
// ---------------------------------------------------------------------------

// Mirrors provider_configs. A (providerKey, version) pair is immutable: publishing a
// change creates a new version, and enabled/disabled is a separate audited change.
export const providerConfigSchema = z.strictObject({
  providerConfigId: z.uuid(),
  providerKey: z.string().min(1),
  version: z.number().int().positive(),
  kind: providerKindSchema,
  adapterId: z.string().min(1),
  modelId: z.string().min(1),
  baseUrl: z.url().optional(),
  // Reference only. The secret itself lives in server configuration and never appears
  // in snapshots, quotes, tasks, API responses or logs.
  credentialRef: z.string().min(1),
  capabilities: providerCapabilitiesSchema,
  parameterMapping: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  sourceMode: sourceModeSchema,
})
export type ProviderConfig = z.infer<typeof providerConfigSchema>

export const providerConfigRefSchema = z.strictObject({
  providerConfigId: z.uuid(),
  providerKey: z.string().min(1),
  version: z.number().int().positive(),
  kind: providerKindSchema,
  adapterId: z.string().min(1),
  modelId: z.string().min(1),
  sourceMode: sourceModeSchema,
})
export type ProviderConfigRef = z.infer<typeof providerConfigRefSchema>

// Written into a quote, copied into the task, and consulted by query/cancel/archive.
// Later default switches never rewrite an existing snapshot.
export const providerSnapshotSchema = z.strictObject({
  config: providerConfigRefSchema,
  capabilities: providerCapabilitiesSchema,
  parameterMapping: z.record(z.string(), z.string()),
  capturedAt: z.iso.datetime(),
})
export type ProviderSnapshot = z.infer<typeof providerSnapshotSchema>

// provider_defaults: exactly one row per kind, used for new requests and new quotes only.
export const providerDefaultSchema = z.strictObject({
  kind: providerKindSchema,
  providerConfigId: z.uuid(),
  version: z.number().int().positive(),
})
export type ProviderDefault = z.infer<typeof providerDefaultSchema>

// ---------------------------------------------------------------------------
// Normalized errors and retry classification
// ---------------------------------------------------------------------------

export const providerErrorCodeSchema = z.enum([
  'UNSUPPORTED_CAPABILITY',
  'INVALID_INPUT',
  'PROVIDER_UNAVAILABLE',
  'AUTHENTICATION_FAILED',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'CONCURRENCY_LIMIT',
  'CONTENT_REJECTED',
  'CANCEL_NOT_SUPPORTED',
  'REQUEST_NOT_FOUND',
  'RESULT_UNKNOWN',
  'INTERNAL_ERROR',
])
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>

// `message` is shown to operators, so it must stay free of credentials, stack traces and
// other users' content. `retryable` means "may be attempted again after a new explicit
// user confirmation", never "the caller may silently resend a charged generation".
export const providerErrorSchema = z.strictObject({
  code: providerErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  requestId: z.string().min(1).optional(),
  details: z.record(z.string(), z.string()).optional(),
})
export type ProviderError = z.infer<typeof providerErrorSchema>

export const providerRequestKeySchema = z.string().min(1).max(200)

const requestFields = {
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1).optional(),
  sourceMode: sourceModeSchema,
  observedAt: z.iso.datetime(),
}

// ---------------------------------------------------------------------------
// Normalized outcomes
// ---------------------------------------------------------------------------

export const providerOutcomeSchema = z.enum(['completed', 'accepted', 'canceled', 'rejected', 'unknown'])
export type ProviderOutcome = z.infer<typeof providerOutcomeSchema>

// Confirmed external cancellation. A cancel request that the vendor refuses stays a
// rejection (CANCEL_NOT_SUPPORTED) and the original request keeps running.
export const providerCanceledSchema = z.strictObject({
  outcome: z.literal('canceled'),
  ...requestFields,
})
export type ProviderCanceled = z.infer<typeof providerCanceledSchema>

export const providerAcceptedSchema = z.strictObject({
  outcome: z.literal('accepted'),
  requestKey: providerRequestKeySchema,
  // An accepted asynchronous request must be addressable by the vendor request id.
  requestId: z.string().min(1),
  providerStatus: z.enum(['queued', 'running']).optional(),
  estimatedSeconds: z.number().nonnegative().optional(),
  sourceMode: sourceModeSchema,
  observedAt: z.iso.datetime(),
})
export type ProviderAccepted = z.infer<typeof providerAcceptedSchema>

export const providerRejectedSchema = z.strictObject({
  outcome: z.literal('rejected'),
  error: providerErrorSchema,
  ...requestFields,
})
export type ProviderRejected = z.infer<typeof providerRejectedSchema>

export const unknownReasonSchema = z.enum([
  'response-lost',
  'timeout-detached',
  'unparsable-response',
  'query-unavailable',
])
export type UnknownReason = z.infer<typeof unknownReasonSchema>

// An uncertain external result is its own outcome. It is never reported as a failure and
// never retried generically: `retryable` is pinned to false and the task moves to
// reconciling until evidence arrives.
export const providerUnknownSchema = z.strictObject({
  outcome: z.literal('unknown'),
  reason: unknownReasonSchema,
  message: z.string().min(1),
  retryable: z.literal(false),
  ...requestFields,
})
export type ProviderUnknown = z.infer<typeof providerUnknownSchema>

// ---------------------------------------------------------------------------
// Normalized status events (query, cancel and provider callbacks all map here)
// ---------------------------------------------------------------------------

export const providerStatusSchema = z.enum([
  'accepted',
  'running',
  'completed',
  'failed',
  'canceled',
  'unknown',
])

export const providerStatusEventSchema = z.strictObject({
  // Deduplication key for repeated or out-of-order callbacks.
  eventKey: z.string().min(1),
  providerStatus: providerStatusSchema,
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1).optional(),
  artifacts: z.array(providerArtifactSchema).optional(),
  error: providerErrorSchema.optional(),
  occurredAt: z.iso.datetime(),
  sourceMode: sourceModeSchema,
})
export type ProviderStatusEvent = z.infer<typeof providerStatusEventSchema>
