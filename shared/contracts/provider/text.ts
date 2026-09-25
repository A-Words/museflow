import { z } from 'zod'
import {
  providerAcceptedSchema,
  providerRejectedSchema,
  providerRequestKeySchema,
  providerUnknownSchema,
  providerUsageSchema,
  sourceModeSchema,
} from './common.js'

// Text port: agent planning, lyrics generation and structured extraction.
// Modes: `generate` is sync, `stream` is stream. A text adapter may additionally answer
// asynchronously (accepted), which the task service completes through query.
// See docs/PROVIDER_CONTRACT.md for the mode matrix and capability requirements.

export const textMessageRoleSchema = z.enum(['system', 'user', 'assistant'])
export type TextMessageRole = z.infer<typeof textMessageRoleSchema>

export const textMessageSchema = z.strictObject({
  role: textMessageRoleSchema,
  content: z.string().min(1),
})
export type TextMessage = z.infer<typeof textMessageSchema>

export const textResponseFormatSchema = z.enum(['text', 'json', 'tool-calls'])
export type TextResponseFormat = z.infer<typeof textResponseFormatSchema>

// Tool names are chosen by the server Tool Registry; a caller cannot widen the set, and
// the provider never receives data-source credentials. `structuredSchemaRef` names a
// server-registered schema instead of accepting free-form JSON Schema from the client.
export const textGenerateInputSchema = z.strictObject({
  requestKey: providerRequestKeySchema,
  messages: z.array(textMessageSchema).min(1).max(100),
  responseFormat: textResponseFormatSchema,
  structuredSchemaRef: z.string().min(1).optional(),
  toolNames: z.array(z.string().min(1)).max(20).optional(),
  maxOutputTokens: z.number().int().positive().max(200_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  // Ordinary planning calls carry a server-side budget instead of a user charge.
  purpose: z.enum(['planning', 'lyrics', 'structured']),
})
export type TextGenerateInput = z.infer<typeof textGenerateInputSchema>

export const textStreamInputSchema = textGenerateInputSchema
export type TextStreamInput = TextGenerateInput

export const textFinishReasonSchema = z.enum([
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'error',
  'unknown',
])
export type TextFinishReason = z.infer<typeof textFinishReasonSchema>

// A tool proposal is not an execution result. It stays unrunnable until the business
// layer stores and confirms it.
export const textToolProposalSchema = z.strictObject({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.json(),
})
export type TextToolProposal = z.infer<typeof textToolProposalSchema>

export const textCompletedSchema = z.strictObject({
  outcome: z.literal('completed'),
  requestKey: providerRequestKeySchema,
  requestId: z.string().min(1).optional(),
  text: z.string(),
  structuredValue: z.json().optional(),
  toolProposals: z.array(textToolProposalSchema),
  finishReason: textFinishReasonSchema,
  usage: providerUsageSchema.optional(),
  sourceMode: sourceModeSchema,
  observedAt: z.iso.datetime(),
})
export type TextCompleted = z.infer<typeof textCompletedSchema>

export const textResultSchema = z.discriminatedUnion('outcome', [
  textCompletedSchema,
  providerAcceptedSchema,
  providerRejectedSchema,
  providerUnknownSchema,
])
export type TextResult = z.infer<typeof textResultSchema>

// Stream events are normalized immediately: no vendor packet reaches the caller, and an
// incomplete tool-call delta cannot be executed. `sequence` must increase by one.
export const textStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    sequence: z.literal(0),
    requestKey: providerRequestKeySchema,
    requestId: z.string().min(1).optional(),
    modelId: z.string().min(1),
    sourceMode: sourceModeSchema,
  }),
  z.strictObject({
    type: z.literal('text-delta'),
    sequence: z.number().int().positive(),
    delta: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('tool-call-delta'),
    sequence: z.number().int().positive(),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1).optional(),
    argumentsDelta: z.string(),
  }),
  z.strictObject({
    type: z.literal('finish'),
    sequence: z.number().int().positive(),
    finishReason: textFinishReasonSchema,
    usage: providerUsageSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('error'),
    sequence: z.number().int().positive(),
    // Sanitized: the caller sees a stable code, never a raw provider error body.
    code: z.enum([
      'UNSUPPORTED_CAPABILITY',
      'PROVIDER_UNAVAILABLE',
      'RATE_LIMITED',
      'CONTENT_REJECTED',
      'RESULT_UNKNOWN',
      'INTERNAL_ERROR',
    ]),
    message: z.string().min(1),
  }),
])
export type TextStreamEvent = z.infer<typeof textStreamEventSchema>
