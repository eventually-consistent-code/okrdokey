/**
 * Purpose: Connector adapter contract + registry. An adapter answers one
 *          question per link: how much work is done. The sync engine owns
 *          everything else (mapping, check-ins, backoff).
 * Author(s): John Reed
 */

export interface LinkProgress {
  done: number;
  total: number; // count-closed mode only reads `done`; total feeds percent
  etag?: string | null; // adapters may hand back a fresh ETag to store
  notModified?: boolean; // 304 — skip the write entirely
}

export interface AdapterInput {
  config: unknown; // provider-specific, already JSON-parsed
  secret: string; // decrypted credential
  etag: string | null;
}

export type ConnectorAdapter = (input: AdapterInput) => Promise<LinkProgress>;

export type AdapterRegistry = Partial<Record<'github' | 'jira', ConnectorAdapter>>;
