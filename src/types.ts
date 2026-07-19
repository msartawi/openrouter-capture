export type CrawlMode = "discover" | "simulate" | "verify";

export interface CrawlOptions {
  routerUrl: string;
  outputDir: string;
  mode: CrawlMode;
  delayMs: number;
  maxRequests: number;
  readOnly: boolean;
  /** When set with password, discover auto-fills the ZTE login form. */
  username?: string;
  password?: string;
}

export const DEFAULTS: { delayMs: number; maxRequests: number } = {
  delayMs: 750,
  maxRequests: 500,
};

export interface EndpointRecord {
  id: string;
  viewTag?: string;
  dataTag?: string;
  fields: string[];
  actionsDetected: string[];
  writeTested: boolean;
  risk: "low" | "medium" | "high" | "critical" | "unknown";
  status?: number;
  objectNames: string[];
}

export interface CapturedExchange {
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, string>;
  status: number;
  contentType?: string;
  responseBodyPreview: string;
  sessionState: "valid" | "timeout" | "unknown";
}
