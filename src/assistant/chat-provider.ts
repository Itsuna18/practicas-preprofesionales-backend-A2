import Anthropic from '@anthropic-ai/sdk'

export interface ProviderMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ProviderReply {
  text: string
  /** El modelo declinó responder por sus políticas. */
  refused: boolean
}

export type ProviderErrorKind = 'auth' | 'rate' | 'model' | 'connection' | 'api'

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Un proveedor de IA que responde una conversación. */
export interface ChatProvider {
  /** Nombre para mostrar en los mensajes de error. */
  readonly label: string
  complete(system: string[], messages: ProviderMessage[]): Promise<ProviderReply>
}

/**
 * Proveedores con la API de chat de OpenAI (`/chat/completions`): Groq, con
 * plan gratuito, y Ollama, que corre el modelo en la propia computadora.
 */
export class OpenAICompatibleProvider implements ChatProvider {
  constructor(
    readonly label: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
  ) {}

  async complete(system: string[], messages: ProviderMessage[]): Promise<ProviderReply> {
    const res = await this.post({
      model: this.model,
      temperature: 0.3,
      // Los modelos que razonan (gpt-oss) gastan parte de este margen pensando.
      max_tokens: 2048,
      messages: [{ role: 'system', content: system.join('\n\n') }, ...messages],
    })
    this.assertOk(res)
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
    return { text: data.choices?.[0]?.message?.content?.trim() ?? '', refused: false }
  }

  private async post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`
    try {
      return await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch {
      throw new ProviderError('connection', `no se pudo conectar con ${this.label}`)
    }
  }

  private assertOk(res: Response): void {
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', `${this.label} rechazó la clave`)
    if (res.status === 429) throw new ProviderError('rate', `${this.label} está limitando las peticiones`)
    if (res.status === 404) throw new ProviderError('model', `${this.label} no tiene el modelo ${this.model}`)
    if (!res.ok) throw new ProviderError('api', `${this.label} respondió ${res.status}`)
  }
}

const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5'

/** Claude (de pago). Se mantiene como opción si el equipo tiene una clave. */
export class AnthropicProvider implements ChatProvider {
  readonly label = 'Claude'

  constructor(
    private readonly client: Anthropic,
    private readonly model = ANTHROPIC_DEFAULT_MODEL,
  ) {}

  async complete(system: string[], messages: ProviderMessage[]): Promise<ProviderReply> {
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        // Chat de preguntas cortas: esfuerzo bajo, respuestas rápidas.
        output_config: { effort: 'low' },
        // Si el modelo declina por política, el servidor reintenta en el modelo recomendado.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: system.map((text) => ({ type: 'text' as const, text })),
        messages,
      })
    } catch (error) {
      throw toProviderError(error)
    }
    if (response.stop_reason === 'refusal') return { text: '', refused: true }
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    return { text, refused: false }
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError) return new ProviderError('auth', 'Claude rechazó la clave')
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('rate', 'Claude está limitando las peticiones')
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('connection', 'no se pudo conectar con Claude')
  if (error instanceof Anthropic.APIError) return new ProviderError('api', `Claude respondió ${error.status ?? 'con error'}`)
  return new ProviderError('api', 'Claude no pudo responder')
}

// Modelo de producción de Groq disponible en el plan gratis (octubre 2026);
// la lista cambia: https://console.groq.com/docs/models
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b'
export const OLLAMA_DEFAULT_MODEL = 'llama3.2'

/**
 * Elige el proveedor según el .env. `AI_PROVIDER` manda; si no está, se usa
 * Groq cuando hay clave de Groq, y Claude cuando solo hay clave de Anthropic.
 * Sin ninguno, el chat avisa que no está configurado.
 */
type Env = NodeJS.ProcessEnv

function hasAnthropicKey(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)
}

const BUILDERS: Record<string, (env: Env) => ChatProvider | null> = {
  groq: (env) =>
    env.GROQ_API_KEY
      ? new OpenAICompatibleProvider('Groq', 'https://api.groq.com/openai/v1', env.GROQ_MODEL || GROQ_DEFAULT_MODEL, env.GROQ_API_KEY)
      : null,
  ollama: (env) =>
    new OpenAICompatibleProvider('Ollama', env.OLLAMA_URL || 'http://localhost:11434/v1', env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL),
  anthropic: (env) =>
    hasAnthropicKey(env) ? new AnthropicProvider(new Anthropic(), env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL) : null,
}

function inferProvider(env: Env): string {
  if (env.GROQ_API_KEY) return 'groq'
  return hasAnthropicKey(env) ? 'anthropic' : ''
}

export function createChatProvider(env: Env = process.env): ChatProvider | null {
  const name = env.AI_PROVIDER?.toLowerCase() || inferProvider(env)
  return BUILDERS[name]?.(env) ?? null
}
