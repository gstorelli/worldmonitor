export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  /** Plaintext key — shown to the user ONCE. */
  key: string;
}

export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  return { id: '', name, keyPrefix: '', key: '' };
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  return [];
}

export async function revokeApiKey(_keyId: string): Promise<void> {
}
