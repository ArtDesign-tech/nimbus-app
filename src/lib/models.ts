export type ModelId =
  | 'gpt-5.5'
  | 'claude-opus-4.7'
  | 'deepseek-v4-pro'
  | 'minimax-m2.5'

export type Gateway = 'tunnel' | 'openrouter'

export type ModelEntry = {
  id: ModelId
  label: string
  logo: string
  gateway: Gateway
  upstreamId: string
  /** Optional backup upstream id (same gateway) to retry when primary upstream fails. */
  fallbackUpstreamId?: string
  plans: ('free' | 'pro')[]
  maxContextTokens: number
  supportsVision: boolean
}

export const MODELS: ModelEntry[] = [
  { id: 'gpt-5.5', label: 'GPT 5.5', logo: '/image/logo/openai.png', gateway: 'tunnel', upstreamId: 'cx/gpt-5.5', plans: ['free', 'pro'], maxContextTokens: 128_000, supportsVision: true },
  { id: 'claude-opus-4.7', label: 'Claude Opus 4.7', logo: '/image/logo/claude.png', gateway: 'tunnel', upstreamId: 'kr/claude-opus-4.7', plans: ['pro'], maxContextTokens: 200_000, supportsVision: true },
  { id: 'deepseek-v4-pro', label: 'DeepSeek v4 Pro', logo: '/image/logo/deepseek.png', gateway: 'tunnel', upstreamId: 'cmc/deepseek/deepseek-v4-pro', plans: ['free'], maxContextTokens: 1_000_000, supportsVision: false },
  { id: 'minimax-m2.5', label: 'MiniMax M2.5', logo: '/image/logo/minimax-color.png', gateway: 'tunnel', upstreamId: 'oc/minimax-m2.5-free', fallbackUpstreamId: 'ollama/minimax-m2.5', plans: ['free'], maxContextTokens: 128_000, supportsVision: false },
]

/** Internal vision preprocessor — not shown in UI */
export const VISION_PREPROCESSOR = {
  gateway: 'openrouter' as Gateway,
  upstreamId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
}

export function findModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id)
}
