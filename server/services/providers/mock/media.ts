import type { ProviderArtifact, ProviderConfig } from '../../../../shared/contracts/provider/common.js'

// Media helpers for the mock adapters. Every value here is deliberately fake and obviously
// so: a fixed checksum, a reserved `.invalid` host, and a fixed byte size. A real adapter
// must report measured values, and the task service must re-validate the download before
// archiving it.

/** Fixed sha256-shaped value; never presented as a real artifact checksum. */
export const mockChecksumSha256 = 'a'.repeat(64)

export function audioMimeType(format: string): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    default:
      return 'application/octet-stream'
  }
}

export function mockAudioArtifact(input: {
  config: ProviderConfig
  requestKey: string
  observedAt: string
  format?: string
  durationMs?: number
  kind?: 'audio' | 'voice_sample'
}): ProviderArtifact {
  const format = input.format ?? input.config.capabilities.limits.audioFormats?.[0] ?? 'mp3'
  return {
    kind: input.kind ?? 'audio',
    mimeType: audioMimeType(format),
    format,
    byteSize: 65_536,
    durationMs: input.durationMs ?? 3_000,
    checksumSha256: mockChecksumSha256,
    // `.invalid` is reserved by RFC 2606, so a leaked mock URL can never reach a real host.
    downloadUrl: `https://mock.invalid/${input.config.adapterId}/${input.requestKey}.${format}`,
    downloadUrlExpiresAt: new Date(Date.parse(input.observedAt) + 3_600_000).toISOString(),
  }
}
