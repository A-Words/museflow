import { z } from 'zod'
import {
  providerAcceptedSchema,
  providerArtifactSchema,
  providerCanceledSchema,
  providerRejectedSchema,
  providerRequestKeySchema,
  providerUnknownSchema,
  providerUsageSchema,
  sourceModeSchema,
} from './common.js'

// Music port: submit a generation, then query or cancel it when the adapter declares
// those capabilities. `submit` is async for every adapter in this project (a full song
// never returns inside the request), so an accepted result carries a vendor request id
// and is never treated as success. Sync adapters that return audio immediately still
// answer `completed` from submit. See docs/PROVIDER_CONTRACT.md.

// A stable requestKey is replayed on the vendor when it supports idempotentSubmit; it is
// not a user idempotency key and never carries credits or ownership information.
export const musicSubmitInputSchema = z
  .strictObject({
    requestKey: providerRequestKeySchema,
    prompt: z.string().min(1),
    instrumental: z.boolean(),
    lyrics: z.string().min(1).optional(),
    // Archived lyrics are referenced by asset id; the service resolves ownership before
    // calling the adapter, so the provider never sees a raw storage location.
    lyricsAssetId: z.uuid().optional(),
    durationSeconds: z.number().int().positive().max(600).optional(),
    format: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    // P1 cover inputs: a rights-declared source asset plus a target voice reference.
    sourceAssetId: z.uuid().optional(),
    voiceRef: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const issue = (message: string, path: string[]) =>
      context.addIssue({ code: 'custom', message, path })
    if (value.lyrics && value.lyricsAssetId) {
      issue('Provide either lyrics text or an archived lyrics asset, not both', ['lyrics'])
    }
    if (value.instrumental && (value.lyrics ?? value.lyricsAssetId)) {
      issue('An instrumental request cannot carry lyrics', ['instrumental'])
    }
    if (value.sourceAssetId && !value.voiceRef) {
      issue('A cover request requires the target voice reference', ['voiceRef'])
    }
    if (value.voiceRef && !value.sourceAssetId) {
      issue('A voice reference is only valid together with a declared source asset', ['voiceRef'])
    }
  })
export type MusicSubmitInput = z.infer<typeof musicSubmitInputSchema>

export const musicQueryInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1),
})
export type MusicQueryInput = z.infer<typeof musicQueryInputSchema>

export const musicCancelInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1),
  reason: z.string().min(1),
})
export type MusicCancelInput = z.infer<typeof musicCancelInputSchema>

// A completed result must carry at least one audio artifact; partial or missing output is
// not a success and cannot be settled as one.
export const musicCompletedSchema = z
  .strictObject({
    outcome: z.literal('completed'),
    requestKey: providerRequestKeySchema,
    requestId: z.string().min(1).optional(),
    artifacts: z.array(providerArtifactSchema).min(1),
    durationMs: z.number().int().positive().optional(),
    format: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    usage: providerUsageSchema.optional(),
    sourceMode: sourceModeSchema,
    observedAt: z.iso.datetime(),
  })
  .refine(value => value.artifacts.some(artifact => artifact.kind === 'audio'), {
    message: 'A completed music result requires at least one audio artifact',
    path: ['artifacts'],
  })
export type MusicCompleted = z.infer<typeof musicCompletedSchema>

export const musicSubmitResultSchema = z.discriminatedUnion('outcome', [
  musicCompletedSchema,
  providerAcceptedSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type MusicSubmitResult = z.infer<typeof musicSubmitResultSchema>

export const musicQueryResultSchema = z.discriminatedUnion('outcome', [
  musicCompletedSchema,
  providerAcceptedSchema,
  providerCanceledSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type MusicQueryResult = z.infer<typeof musicQueryResultSchema>

// A rejected cancel keeps the original request running; it must not release credits.
export const musicCancelResultSchema = z.discriminatedUnion('outcome', [
  providerCanceledSchema,
  musicCompletedSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type MusicCancelResult = z.infer<typeof musicCancelResultSchema>
