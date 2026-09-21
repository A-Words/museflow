import { describe, expect, it } from 'vitest'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, convertToModelMessages, simulateReadableStream, streamText, tool } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthClient } from 'better-auth/vue'
import { createDatabase } from '@museflow/database'

describe('locked SDK compatibility (Mock, no real provider)', () => {
  it('streams a Mock model through the native UI protocol into the Vue client', async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'Mock response' },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 2, text: 2, reasoning: 0 },
              },
            },
          ],
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      },
    })
    const inputSchema = z.object({ text: z.string().min(1) })
    const chat = new Chat({
      transport: new DefaultChatTransport({
        fetch: async (_url, options) => {
          const { messages } = JSON.parse(String(options?.body))
          return streamText({
            model,
            messages: await convertToModelMessages(messages),
            tools: { echo: tool({ description: 'Compatibility schema only', inputSchema }) },
          }).toUIMessageStreamResponse()
        },
      }),
    })
    await chat.sendMessage({ text: 'hello' })
    expect(chat.error).toBeUndefined()
    expect(chat.status).toBe('ready')
    expect(chat.messages.at(-1)?.parts).toContainEqual(expect.objectContaining({ type: 'text', text: 'Mock response' }))
    expect(model.doStreamCalls[0]?.tools).toContainEqual(expect.objectContaining({ name: 'echo', inputSchema: expect.objectContaining({ type: 'object' }) }))
    const history = await convertToModelMessages(chat.messages)
    expect(history.map(message => message.role)).toEqual(['user', 'assistant'])
  })

  it('constructs Better Auth with the Drizzle adapter and Vue client without business tables', async () => {
    const database = createDatabase('postgresql://unused:unused@127.0.0.1:1/unused')
    try {
      const auth = betterAuth({
        database: drizzleAdapter(database.db, { provider: 'pg' }),
        baseURL: 'http://127.0.0.1:3000',
        secret: 'mf04-test-only-secret-at-least-32-characters',
        emailAndPassword: { enabled: true },
      })
      const client = createAuthClient({ baseURL: 'http://127.0.0.1:3000' })
      expect(typeof auth.handler).toBe('function')
      expect(typeof client.signIn.email).toBe('function')
      expect((await auth.$context).options.database).toBeDefined()
    }
    finally {
      await database.close()
    }
  })
})
