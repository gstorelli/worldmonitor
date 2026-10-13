// Declaration file for scripts/_llm-models.mjs (fork model tiers, 13/10/2026),
// shared by the seeders and the bundled server code.
export const DEFAULT_LLM_FAST_MODEL: string;
export const DEFAULT_LLM_QUALITY_MODEL: string;
export const DEFAULT_OPENROUTER_API_BASE: string;
export const OPENROUTER_ATTRIBUTION_HEADERS: Readonly<{
  'HTTP-Referer': string;
  'X-Title': string;
}>;

export function getLlmFastModel(): string;
export function getLlmQualityModel(): string;
export function getOpenRouterApiBase(): string;
export function getOpenRouterChatUrl(): string;
export function isInheritedMarketLlmEnabled(): boolean;
