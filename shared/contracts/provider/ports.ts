import type { ProviderCapabilities, ProviderConfig, SourceMode } from './common.js'
import type {
  MusicCancelInput,
  MusicCancelResult,
  MusicQueryInput,
  MusicQueryResult,
  MusicSubmitInput,
  MusicSubmitResult,
} from './music.js'
import type {
  SpeechCancelInput,
  SpeechCancelResult,
  SpeechQueryInput,
  SpeechQueryResult,
  SpeechSynthesizeInput,
  SpeechSynthesizeResult,
} from './speech.js'
import type { TextGenerateInput, TextResult, TextStreamEvent, TextStreamInput } from './text.js'

// The three internal ports. Each adapter implements one port and is reachable only through
// a configuration version, so business code calls a port instead of a vendor SDK.
//
// Two rules keep the ports honest:
// 1. Every declared method exists, even when the vendor does not support it. An unsupported
//    operation answers `rejected` with UNSUPPORTED_CAPABILITY (or a single `error` event for
//    a stream) instead of silently degrading or faking a result.
// 2. Callers still check `capabilities()` before spending a request, as described in
//    docs/PROVIDER_CONTRACT.md. A capability mismatch is refused before the call, not after.

export interface ProviderAdapterBase {
  readonly adapterId: string
  /** The immutable configuration version this instance was built from. */
  readonly config: ProviderConfig
  /** Mirrors config.sourceMode; mock output can never be reported as a real result. */
  readonly sourceMode: SourceMode
  capabilities(): ProviderCapabilities
}

export interface TextProviderPort extends ProviderAdapterBase {
  generate(input: TextGenerateInput): Promise<TextResult>
  /**
   * The first event is `start`, followed by deltas and a `finish`. The only exception is a
   * stream that cannot run at all: an adapter without stream support, or a request the
   * configuration cannot satisfy, yields exactly one `error` event (UNSUPPORTED_CAPABILITY
   * among others) and never a fake delta or a `start` it cannot follow up.
   */
  stream(input: TextStreamInput): AsyncIterable<TextStreamEvent>
}

export interface MusicProviderPort extends ProviderAdapterBase {
  submit(input: MusicSubmitInput): Promise<MusicSubmitResult>
  query(input: MusicQueryInput): Promise<MusicQueryResult>
  cancel(input: MusicCancelInput): Promise<MusicCancelResult>
}

export interface SpeechProviderPort extends ProviderAdapterBase {
  synthesize(input: SpeechSynthesizeInput): Promise<SpeechSynthesizeResult>
  query(input: SpeechQueryInput): Promise<SpeechQueryResult>
  cancel(input: SpeechCancelInput): Promise<SpeechCancelResult>
}

export type ProviderPort = TextProviderPort | MusicProviderPort | SpeechProviderPort
