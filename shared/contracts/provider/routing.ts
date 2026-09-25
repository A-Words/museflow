import { z } from 'zod'
import {
  invocationModeSchema,
  providerCapabilitiesSchema,
  providerConfigSchema,
  providerErrorSchema,
  providerOutputTypeSchema,
  providerSnapshotSchema,
  providerVoiceKindSchema,
  type ProviderCapabilities,
  type ProviderConfig,
  type ProviderConfigRef,
  type ProviderDefault,
  type ProviderError,
  type ProviderErrorCode,
  type ProviderKind,
  type ProviderSnapshot,
  type TextOperation,
} from './common.js'
import type { TextGenerateInput } from './text.js'
import type { MusicSubmitInput } from './music.js'
import type { SpeechSynthesizeInput } from './speech.js'

// Routing rules for switchable providers (FR-11, T-26, T-27):
// - A new request or quote reads the current default of its kind.
// - A quote stores a snapshot; a task copies it. Resolving an existing snapshot never
//   reads the defaults, which is what keeps old quotes, running tasks and cloned voice
//   profiles on their original provider.
// - A capability mismatch is refused before the call instead of failing mid-request.

export const capabilityRequirementSchema = z.strictObject({
  operation: z.string().min(1),
  mode: invocationModeSchema.optional(),
  outputType: providerOutputTypeSchema.optional(),
  // Declared optional abilities (query, cancel, callbacks, ...) are checked before use so a
  // missing ability is refused up front instead of discovered mid-request.
  support: z.enum(['query', 'cancel', 'idempotentSubmit', 'callbacks', 'remoteDelete']).optional(),
  maxInputCharacters: z.number().int().positive().optional(),
  maxDurationSeconds: z.number().int().positive().optional(),
  audioFormat: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  voiceKind: providerVoiceKindSchema.optional(),
})
export type CapabilityRequirement = z.infer<typeof capabilityRequirementSchema>

// Only these codes may be attempted again, and only after a new explicit user
// confirmation. Everything else needs a changed input, a different tool, or an operator.
const retryableCodes: readonly ProviderErrorCode[] = [
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'CONCURRENCY_LIMIT',
]

export function providerError(
  code: ProviderErrorCode,
  message: string,
  extra: { requestId?: string; details?: Record<string, string> } = {},
): ProviderError {
  return providerErrorSchema.parse({
    code,
    message,
    retryable: retryableCodes.includes(code),
    ...extra,
  })
}

export type CapabilityCheck = { ok: true } | { ok: false; error: ProviderError }

// An undeclared limit is not a match: the port must state what it guarantees instead of
// accepting an input it may silently truncate or reject later.
export function checkCapabilities(
  capabilities: ProviderCapabilities,
  requirement: CapabilityRequirement,
): CapabilityCheck {
  const missing = (detail: string) =>
    ({
      ok: false,
      error: providerError('UNSUPPORTED_CAPABILITY', `Provider does not support ${detail}`, {
        details: { operation: requirement.operation, requirement: detail },
      }),
    }) as const

  if (!capabilities.operations.includes(requirement.operation)) {
    return missing(`operation "${requirement.operation}"`)
  }
  if (requirement.mode && !capabilities.modes.includes(requirement.mode)) {
    return missing(`mode "${requirement.mode}"`)
  }
  if (requirement.outputType && !capabilities.outputTypes.includes(requirement.outputType)) {
    return missing(`output type "${requirement.outputType}"`)
  }
  if (requirement.support && !capabilities.supports[requirement.support]) {
    return missing(`"${requirement.support}"`)
  }
  const { limits } = capabilities
  if (requirement.maxInputCharacters) {
    if (limits.maxInputCharacters === undefined || limits.maxInputCharacters < requirement.maxInputCharacters) {
      return missing(`an input of ${requirement.maxInputCharacters} characters`)
    }
  }
  if (requirement.maxDurationSeconds) {
    if (limits.maxDurationSeconds === undefined || limits.maxDurationSeconds < requirement.maxDurationSeconds) {
      return missing(`a duration of ${requirement.maxDurationSeconds} seconds`)
    }
  }
  if (requirement.audioFormat && !(limits.audioFormats ?? []).includes(requirement.audioFormat)) {
    return missing(`audio format "${requirement.audioFormat}"`)
  }
  if (requirement.language && !(limits.languages ?? []).includes(requirement.language)) {
    return missing(`language "${requirement.language}"`)
  }
  if (requirement.voiceKind && !(limits.voiceKinds ?? []).includes(requirement.voiceKind)) {
    return missing(`voice kind "${requirement.voiceKind}"`)
  }
  return { ok: true }
}

export function checkAllCapabilities(
  capabilities: ProviderCapabilities,
  requirements: readonly CapabilityRequirement[],
): CapabilityCheck {
  for (const requirement of requirements) {
    const check = checkCapabilities(capabilities, requirement)
    if (!check.ok) return check
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Deriving requirements from a normalized request
// ---------------------------------------------------------------------------

export function deriveTextRequirements(input: TextGenerateInput, operation: TextOperation): CapabilityRequirement[] {
  const requirements: CapabilityRequirement[] = [
    { operation, mode: operation === 'stream' ? 'stream' : 'sync' },
  ]
  if (input.responseFormat === 'json') requirements.push({ operation, outputType: 'structured' })
  if (input.responseFormat === 'tool-calls') requirements.push({ operation, outputType: 'tool-calls' })
  const characters = input.messages.reduce((total, message) => total + message.content.length, 0)
  requirements.push({ operation, maxInputCharacters: Math.max(characters, 1) })
  return requirements
}

export function deriveMusicRequirements(input: MusicSubmitInput): CapabilityRequirement[] {
  const requirements: CapabilityRequirement[] = [{ operation: 'submit' }]
  if (input.durationSeconds) requirements.push({ operation: 'submit', maxDurationSeconds: input.durationSeconds })
  if (input.format) requirements.push({ operation: 'submit', audioFormat: input.format })
  if (input.language) requirements.push({ operation: 'submit', language: input.language })
  if (input.sourceAssetId && input.voiceRef) requirements.push({ operation: 'submit', voiceKind: 'cloned' })
  return requirements
}

export function deriveSpeechRequirements(input: SpeechSynthesizeInput): CapabilityRequirement[] {
  const requirements: CapabilityRequirement[] = [
    { operation: 'synthesize', maxInputCharacters: Math.max(input.text.length, 1) },
    { operation: 'synthesize', language: input.language },
  ]
  if (input.format) requirements.push({ operation: 'synthesize', audioFormat: input.format })
  return requirements
}

// ---------------------------------------------------------------------------
// Configuration versions
// ---------------------------------------------------------------------------

export type PublishConfigResult =
  | { ok: true; config: ProviderConfig }
  | { ok: false; error: ProviderError }

// (providerKey, version) is immutable. Publishing a change always creates a new version;
// enabled/disabled is a separate audited change and never rewrites a published version.
// The id is supplied by the caller: shared contracts never need a random source.
export function publishProviderConfig(
  existing: readonly ProviderConfig[],
  input: Omit<ProviderConfig, 'version'>,
): PublishConfigResult {
  const sameKey = existing.filter(config => config.providerKey === input.providerKey)
  const highest = sameKey.reduce((max, config) => Math.max(max, config.version), 0)
  const parsed = providerConfigSchema.safeParse({ ...input, version: highest + 1 })
  if (!parsed.success) {
    return {
      ok: false,
      error: providerError('INVALID_INPUT', 'Provider configuration does not match the contract', {
        details: { fields: parsed.error.issues.map(issue => issue.path.join('.')).join(',') },
      }),
    }
  }
  return { ok: true, config: parsed.data }
}

// ---------------------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------------------

export function snapshotProvider(config: ProviderConfig, capturedAt: string): ProviderSnapshot {
  return providerSnapshotSchema.parse({
    config: {
      providerConfigId: config.providerConfigId,
      providerKey: config.providerKey,
      version: config.version,
      kind: config.kind,
      adapterId: config.adapterId,
      modelId: config.modelId,
      sourceMode: config.sourceMode,
    },
    capabilities: config.capabilities,
    parameterMapping: config.parameterMapping,
    capturedAt,
  })
}

export type NewRequestRoute =
  | { ok: true; config: ProviderConfig; snapshot: ProviderSnapshot }
  | { ok: false; error: ProviderError }

function findConfig(
  configs: readonly ProviderConfig[],
  ref: { providerConfigId: string; version: number },
): ProviderConfig | undefined {
  return configs.find(
    config => config.providerConfigId === ref.providerConfigId && config.version === ref.version,
  )
}

// New quotes and new requests read the current default and freeze it into a snapshot.
export function selectProviderForNewRequest(input: {
  kind: ProviderKind
  defaults: readonly ProviderDefault[]
  configs: readonly ProviderConfig[]
  requirements?: readonly CapabilityRequirement[]
  now: string
}): NewRequestRoute {
  const fallback = input.defaults.find(entry => entry.kind === input.kind)
  if (!fallback) {
    return {
      ok: false,
      error: providerError('PROVIDER_UNAVAILABLE', `No default ${input.kind} provider configuration is published`),
    }
  }
  const config = findConfig(input.configs, fallback)
  if (!config || config.kind !== input.kind) {
    return {
      ok: false,
      error: providerError(
        'PROVIDER_UNAVAILABLE',
        `The default ${input.kind} configuration version is no longer readable`,
        { details: { providerConfigId: fallback.providerConfigId, version: String(fallback.version) } },
      ),
    }
  }
  if (!config.enabled) {
    return {
      ok: false,
      error: providerError('PROVIDER_UNAVAILABLE', `The default ${input.kind} configuration is disabled`, {
        details: { providerKey: config.providerKey, version: String(config.version) },
      }),
    }
  }
  const check = checkAllCapabilities(config.capabilities, input.requirements ?? [])
  if (!check.ok) return { ok: false, error: check.error }
  return { ok: true, config, snapshot: snapshotProvider(config, input.now) }
}

export type SnapshotRoute =
  | { ok: true; config: ProviderConfig; snapshot: ProviderSnapshot }
  | { ok: false; error: ProviderError }

export type ConfigResolution = { ok: true; config: ProviderConfig } | { ok: false; error: ProviderError }

// Shared by stored snapshots and by records that only keep a configuration reference (for
// example a cloned voice profile bound to its provider). It never reads the provider defaults,
// so an in-flight request cannot be moved to a newly selected provider, and a disabled
// original configuration is reported instead of silently replaced.
function resolvePublishedConfig(input: {
  config: ProviderConfigRef
  configs: readonly ProviderConfig[]
  requirements?: readonly CapabilityRequirement[]
  /** Capability snapshot taken when the work was quoted; compared against the published version. */
  expectedCapabilities?: ProviderCapabilities
}): ConfigResolution {
  const ref = input.config
  const found = findConfig(input.configs, ref)
  if (!found || found.kind !== ref.kind) {
    return {
      ok: false,
      error: providerError(
        'PROVIDER_UNAVAILABLE',
        'The original provider configuration version is no longer readable; requote or reconcile',
        { details: { providerKey: ref.providerKey, version: String(ref.version) } },
      ),
    }
  }
  if (!found.enabled) {
    return {
      ok: false,
      error: providerError('PROVIDER_UNAVAILABLE', 'The original provider configuration is disabled', {
        details: { providerKey: ref.providerKey, version: String(ref.version) },
      }),
    }
  }
  if (found.adapterId !== ref.adapterId || found.modelId !== ref.modelId) {
    return {
      ok: false,
      error: providerError('PROVIDER_UNAVAILABLE', 'The published configuration no longer matches the stored reference', {
        details: { providerKey: ref.providerKey, version: String(ref.version) },
      }),
    }
  }
  // Version immutability means the capability snapshot must still match the published version.
  // Both sides are parsed first so the comparison is not sensitive to key order.
  let capabilities = found.capabilities
  if (input.expectedCapabilities) {
    const publishedCapabilities = providerCapabilitiesSchema.safeParse(found.capabilities)
    const storedCapabilities = providerCapabilitiesSchema.safeParse(input.expectedCapabilities)
    if (
      publishedCapabilities.success &&
      storedCapabilities.success &&
      JSON.stringify(publishedCapabilities.data) !== JSON.stringify(storedCapabilities.data)
    ) {
      return {
        ok: false,
        error: providerError(
          'UNSUPPORTED_CAPABILITY',
          'The stored capability snapshot no longer matches the published configuration version',
          { details: { providerKey: ref.providerKey, version: String(ref.version) } },
        ),
      }
    }
    capabilities = input.expectedCapabilities
  }
  const check = checkAllCapabilities(capabilities, input.requirements ?? [])
  if (!check.ok) return { ok: false, error: check.error }
  return { ok: true, config: found }
}

// Existing quotes, running tasks and their query/cancel/archive calls.
export function resolveSnapshotRoute(input: {
  snapshot: ProviderSnapshot
  configs: readonly ProviderConfig[]
  requirements?: readonly CapabilityRequirement[]
}): SnapshotRoute {
  const resolved = resolvePublishedConfig({
    config: input.snapshot.config,
    configs: input.configs,
    expectedCapabilities: input.snapshot.capabilities,
    ...(input.requirements ? { requirements: input.requirements } : {}),
  })
  if (!resolved.ok) return resolved
  return { ok: true, config: resolved.config, snapshot: input.snapshot }
}

// Records that store only a configuration id + version follow the same rule: the cloned voice
// profile keeps its original provider and is never migrated by a default switch.
export function resolveConfigReferenceRoute(input: {
  config: ProviderConfigRef
  configs: readonly ProviderConfig[]
  requirements?: readonly CapabilityRequirement[]
}): ConfigResolution {
  return resolvePublishedConfig({
    config: input.config,
    configs: input.configs,
    ...(input.requirements ? { requirements: input.requirements } : {}),
  })
}

// ---------------------------------------------------------------------------
// Retry classification
// ---------------------------------------------------------------------------

export type ProviderStage = 'submit' | 'query' | 'archive' | 'cancel' | 'callback'
export type RetryDecision =
  /** Bounded backoff, at most 3 attempts in the stage. Never used for a generation submit. */
  | 'bounded-retry'
  /** Stop calling: the external result is unknown, a human or a query must resolve it. */
  | 'reconcile'
  /** The user may try again only through a new quote and confirmation. */
  | 'requote'
  /** No automatic retry and no charged resend. Requires changed input or an operator. */
  | 'never'

// A generation submit never uses a generic network retry: an unacknowledged submit may
// still be running at the vendor, so resending can produce two charged generations.
// Query, archive and cancel are read-mostly or idempotent and may use bounded backoff.
export function classifyProviderFailure(input: {
  code: ProviderErrorCode
  stage: ProviderStage
  unknown?: boolean
}): RetryDecision {
  if (input.unknown || input.code === 'RESULT_UNKNOWN') return 'reconcile'
  const transient = input.code === 'PROVIDER_UNAVAILABLE' || input.code === 'RATE_LIMITED'
  if (input.stage === 'query' || input.stage === 'archive' || input.stage === 'cancel' || input.stage === 'callback') {
    return transient ? 'bounded-retry' : 'never'
  }
  if (transient || input.code === 'CONCURRENCY_LIMIT') return 'requote'
  return 'never'
}

/** Single-stage ceiling for 'bounded-retry'; a stage is query, archive or cancel. */
export const boundedRetryLimit = 3
