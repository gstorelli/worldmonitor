export interface McpClientInfo {
  id: string;
  name?: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface McpQuota {
  used: number;
  limit: number;
  resetsAt: string;
}

export async function listMcpClients(): Promise<McpClientInfo[]> {
  return [];
}

export async function revokeMcpClient(_tokenId: string): Promise<void> {
}

export async function fetchMcpQuota(): Promise<McpQuota> {
  return {
    used: 0,
    limit: 50,
    resetsAt: new Date().toISOString()
  };
}
