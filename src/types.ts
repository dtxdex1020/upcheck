export interface CheckTarget {
  url: string;
  /** Label for output. Defaults to the URL. */
  name?: string;
  method?: 'GET' | 'HEAD';
  /** Accepted status codes. Defaults to any 2xx or 3xx. */
  expectStatus?: number | number[];
  /** Text that must appear in the response body. */
  keyword?: string;
  timeout?: number;
  /** Fail when the certificate expires in fewer days than this. */
  minTlsDays?: number;
  headers?: Record<string, string>;
}

export type CheckDefaults = Omit<CheckTarget, 'url' | 'name'>;

export interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  /** Time to response headers plus body, in ms. */
  ms?: number;
  tlsDaysLeft?: number;
  tlsValidTo?: string;
  keywordFound?: boolean;
  /** Why the check failed. Empty when ok. */
  errors: string[];
}
