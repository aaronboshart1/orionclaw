/**
 * Tests for HindsightApiClient and HindsightMemoryProvider.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { HindsightApiClient } from '../memory/hindsight-api.js';
import { HindsightMemoryProvider } from '../memory/hindsight-memory-provider.js';

describe('HindsightApiClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('retain', () => {
    it('should POST items to the correct endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const client = new HindsightApiClient('http://localhost:8888');
      const result = await client.retain('test-bank', [
        { content: 'lesson 1', context: 'lesson' },
      ]);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8888/v1/default/banks/test-bank/memories');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].content).toBe('lesson 1');
      expect(body.items[0].context).toBe('lesson');
    });

    it('should return false on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error' });
      const client = new HindsightApiClient();
      const result = await client.retain('bank', [{ content: 'x', context: 'y' }]);
      expect(result).toBe(false);
    });

    it('should return false when Hindsight is down', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new HindsightApiClient();
      const result = await client.retain('bank', [{ content: 'x', context: 'y' }]);
      expect(result).toBe(false);
    });
  });

  describe('recall', () => {
    it('should POST query and return text', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'recalled memory content' }),
      });

      const client = new HindsightApiClient('http://localhost:8888');
      const result = await client.recall('test-bank', 'search query', 2048, 'mid');

      expect(result).toBe('recalled memory content');
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('http://localhost:8888/v1/default/banks/test-bank/memories/recall');
      const body = JSON.parse(opts.body);
      expect(body.query).toBe('search query');
      expect(body.max_tokens).toBe(2048);
      expect(body.budget).toBe('mid');
    });

    it('should return empty string on error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
      const client = new HindsightApiClient();
      const result = await client.recall('bank', 'query');
      expect(result).toBe('');
    });

    it('should handle string response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => 'plain string response',
      });
      const client = new HindsightApiClient();
      const result = await client.recall('bank', 'query');
      expect(result).toBe('plain string response');
    });
  });

  describe('listBanks', () => {
    it('should return bank list', async () => {
      const banks = [{ id: 'jarvis-core' }, { id: 'infra' }];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => banks,
      });

      const client = new HindsightApiClient();
      const result = await client.listBanks();
      expect(result).toEqual(banks);
    });

    it('should return empty array when down', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new HindsightApiClient();
      const result = await client.listBanks();
      expect(result).toEqual([]);
    });
  });
});

describe('HindsightMemoryProvider', () => {
  const originalFetch2 = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch2;
  });

  it('should recall from configured bank', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'memory content' }),
    });

    const provider = new HindsightMemoryProvider({
      url: 'http://localhost:8888',
      bankId: 'jarvis-core',
    });

    const result = await provider.recall('test query', 1024);
    expect(result).toBe('memory content');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('jarvis-core');
  });

  it('should use default bank jarvis-core', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '' }),
    });

    const provider = new HindsightMemoryProvider();
    await provider.recall('query', 512);

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('jarvis-core');
  });

  it('should return empty string when Hindsight is down', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new HindsightMemoryProvider();
    const result = await provider.recall('query', 512);
    expect(result).toBe('');
  });
});
