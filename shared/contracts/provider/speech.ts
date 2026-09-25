import { z } from 'zod'
import {
  hasRetrievableAudio,
  providerAcceptedSchema,
  providerArtifactSchema,
  providerCanceledSchema,
  providerRejectedSchema,
  providerRequestKeySchema,
  providerUnknownSchema,
  providerUsageSchema,
  providerVoiceKindSchema,
  sourceModeSchema,
} from './common.js'

// Speech port: text (plus a voice reference, language and format) to an audio artifact.
// `synthesize` may answer synchronously with audio or asynchronously with an accepted
// request; query and cancel are opened only when the adapter declares them.
// A voice reference refers to a preset voice or a cloned profile that the service already
// validated for ownership and consent. See docs/PROVIDER_CONTRACT.md.

export const speechSynthesizeInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  text: z.string().min(1),
  voiceRef: z.string().min(1),
  language: z.string().min(1),
  format: z.string().min(1).optional(),
  sampleRateHz: z.number().int().positive().optional(),
  speed: z.number().min(0.25).max(4).optional(),
})
export type SpeechSynthesizeInput = z.infer<typeof speechSynthesizeInputSchema>

export const speechQueryInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1),
})
export type SpeechQueryInput = z.infer<typeof speechQueryInputSchema>

export const speechCancelInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1),
  reason: z.string().min(1),
})
export type SpeechCancelInput = z.infer<typeof speechCancelInputSchema>

// Voice, language and format travel with the artifact so the caller can verify that the
// delivered audio matches the confirmed request instead of inferring it from the URL.
export const speechCompletedSchema = z
  .strictObject({
    outcome: z.literal('completed'),
    requestKey: providerRequestKeySchema,
    requestId: z.string().min(1).optional(),
    artifacts: z.array(providerArtifactSchema).min(1),
    voiceRef: z.string().min(1),
    voiceKind: providerVoiceKindSchema,
    language: z.string().min(1),
    format: z.string().min(1).optional(),
    durationMs: z.number().int().positive().optional(),
    usage: providerUsageSchema.optional(),
    sourceMode: sourceModeSchema,
    observedAt: z.iso.datetime(),
  })
  .refine(value => hasRetrievableAudio(value.artifacts), {
    message: 'A completed speech result requires an audio artifact with a retrievable download URL',
    path: ['artifacts'],
  })
export type SpeechCompleted = z.infer<typeof speechCompletedSchema>

export const speechSynthesizeResultSchema = z.discriminatedUnion('outcome', [
  speechCompletedSchema,
  providerAcceptedSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type SpeechSynthesizeResult = z.infer<typeof speechSynthesizeResultSchema>

export const speechQueryResultSchema = z.discriminatedUnion('outcome', [
  speechCompletedSchema,
  providerAcceptedSchema,
  providerCanceledSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type SpeechQueryResult = z.infer<typeof speechQueryResultSchema>

export const speechCancelResultSchema = z.discriminatedUnion('outcome', [
  providerCanceledSchema,
  speechCompletedSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type SpeechCancelResult = z.infer<typeof speechCancelResultSchema>
