import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnthropicProvider,
  GROQ_DEFAULT_MODEL,
  OLLAMA_DEFAULT_MODEL,
  OpenAICompatibleProvider,
  ProviderError,
  createChatProvider,
} from './chat-provider'

const ask = [{ role: 'user' as const, content: '¿Cuántas horas me faltan?' }]

afterEach(() => vi.unstubAllGlobals())

function stubFetch(response: Partial<Response> | Error) {
  const fetchMock = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('createChatProvider', () => {
  it('uses Groq when there is a Groq key', () => {
    const provider = createChatProvider({ GROQ_API_KEY: 'gsk_prueba' })
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider)
    expect(provider?.label).toBe('Groq')
  })

  it('prefers the free provider when both keys exist', () => {
    expect(createChatProvider({ GROQ_API_KEY: 'gsk', ANTHROPIC_API_KEY: 'sk-ant' })?.label).toBe('Groq')
  })

  it('uses Claude when it is the only key', () => {
    expect(createChatProvider({ ANTHROPIC_API_KEY: 'sk-ant-prueba' })).toBeInstanceOf(AnthropicProvider)
  })

  it('follows AI_PROVIDER, including Ollama without key', () => {
    expect(createChatProvider({ AI_PROVIDER: 'ollama' })?.label).toBe('Ollama')
    expect(createChatProvider({ AI_PROVIDER: 'ANTHROPIC', ANTHROPIC_API_KEY: 'sk', GROQ_API_KEY: 'gsk' })?.label).toBe('Claude')
  })

  it('returns null without configuration or when the chosen provider has no key', () => {
    expect(createChatProvider({})).toBeNull()
    expect(createChatProvider({ AI_PROVIDER: 'groq' })).toBeNull()
    expect(createChatProvider({ AI_PROVIDER: 'otro' })).toBeNull()
  })
})

describe('OpenAICompatibleProvider', () => {
  it('calls Groq with the key, the default model and the system prompt first', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' Te faltan 180 horas. ' } }] }) })
    const provider = createChatProvider({ GROQ_API_KEY: 'gsk_prueba' })!

    await expect(provider.complete(['reglas', 'CONTEXTO\ndatos'], ask)).resolves.toEqual({ text: 'Te faltan 180 horas.', refused: false })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_prueba')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe(GROQ_DEFAULT_MODEL)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'reglas\n\nCONTEXTO\ndatos' })
    expect(body.messages[1]).toEqual(ask[0])
  })

  it('calls Ollama locally without an Authorization header', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'hola' } }] }) })
    await createChatProvider({ AI_PROVIDER: 'ollama' })!.complete(['reglas'], ask)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string).model).toBe(OLLAMA_DEFAULT_MODEL)
  })

  it.each([
    [401, 'auth'],
    [429, 'rate'],
    [500, 'api'],
  ] as const)('maps HTTP %s to a %s error', async (status, kind) => {
    stubFetch({ ok: false, status })
    const error = await new OpenAICompatibleProvider('Groq', 'https://x', 'm', 'k').complete([], ask).catch((e) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error.kind).toBe(kind)
  })

  it('maps a network failure to a connection error', async () => {
    stubFetch(new TypeError('fetch failed'))
    const error = await new OpenAICompatibleProvider('Ollama', 'http://localhost:11434/v1', 'm').complete([], ask).catch((e) => e)
    expect(error.kind).toBe('connection')
  })

  it('returns an empty text when the provider sends no choices', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({}) })
    await expect(new OpenAICompatibleProvider('Groq', 'https://x', 'm').complete([], ask)).resolves.toEqual({ text: '', refused: false })
  })
})

describe('AnthropicProvider', () => {
  const create = vi.fn()
  const client = { beta: { messages: { create } } } as unknown as Anthropic

  it('sends the system blocks, low effort and the server fallback', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'ok' }] })
    await expect(new AnthropicProvider(client).complete(['reglas', 'contexto'], ask)).resolves.toEqual({ text: 'ok', refused: false })

    const params = create.mock.calls[0][0]
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.output_config).toEqual({ effort: 'low' })
    expect(params.fallbacks).toBe('default')
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.system).toEqual([{ type: 'text', text: 'reglas' }, { type: 'text', text: 'contexto' }])
  })

  it('reports refusals', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] })
    await expect(new AnthropicProvider(client).complete([], ask)).resolves.toEqual({ text: '', refused: true })
  })

  it('maps SDK errors', async () => {
    create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: 'down' }))
    const error = await new AnthropicProvider(client).complete([], ask).catch((e) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error.kind).toBe('connection')
  })
})
