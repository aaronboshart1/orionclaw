/**
 * OrionClaw — Hindsight API Client
 *
 * HTTP client for the Hindsight temporal knowledge graph.
 * Uses native fetch (Node 22+). All errors are non-fatal.
 */

export interface HindsightMemoryItem {
  content: string;
  context: string;
  timestamp?: string;
}

export interface HindsightRecallOptions {
  query: string;
  max_tokens?: number;
  budget?: "low" | "mid" | "high";
}

export interface HindsightBank {
  id: string;
  [key: string]: unknown;
}

export class HindsightApiClient {
  private baseUrl: string;

  constructor(baseUrl = "http://10.0.0.13:8888") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Retain memories to a bank.
   * POST /v1/default/banks/{bankId}/memories
   */
  async retain(bankId: string, items: HindsightMemoryItem[]): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/default/banks/${bankId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            content: i.content,
            context: i.context,
            timestamp: i.timestamp ?? new Date().toISOString(),
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        console.warn(`[HindsightAPI] retain failed: ${resp.status} ${resp.statusText}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[HindsightAPI] retain error (Hindsight may be down):`, (err as Error).message);
      return false;
    }
  }

  /**
   * Recall memories from a bank.
   * POST /v1/default/banks/{bankId}/memories/recall
   */
  async recall(
    bankId: string,
    query: string,
    maxTokens = 4096,
    budget: "low" | "mid" | "high" = "mid",
  ): Promise<string> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/default/banks/${bankId}/memories/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_tokens: maxTokens, budget }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        console.warn(`[HindsightAPI] recall failed: ${resp.status} ${resp.statusText}`);
        return "";
      }
      const data = (await resp.json()) as Record<string, unknown>;
      // Return the text content from the response
      if (typeof data === "string") {
        return data;
      }
      if (typeof data["text"] === "string") {
        return data["text"];
      }
      if (typeof data["content"] === "string") {
        return data["content"];
      }
      if (typeof data["result"] === "string") {
        return data["result"];
      }
      return JSON.stringify(data);
    } catch (err) {
      console.warn(`[HindsightAPI] recall error (Hindsight may be down):`, (err as Error).message);
      return "";
    }
  }

  /**
   * List available banks.
   * GET /v1/default/banks
   */
  async listBanks(): Promise<HindsightBank[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/default/banks`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        console.warn(`[HindsightAPI] listBanks failed: ${resp.status} ${resp.statusText}`);
        return [];
      }
      const data = await resp.json();
      return Array.isArray(data) ? (data as HindsightBank[]) : [];
    } catch (err) {
      console.warn(`[HindsightAPI] listBanks error:`, (err as Error).message);
      return [];
    }
  }
}
