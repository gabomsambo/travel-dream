/** What the settings page may see about a personal share token. Never the hash or the token itself. */
export interface ShareTokenSummary {
  id: string;
  name: string;
  /** The token's first characters (`td_share_AbCd`), to tell tokens apart. */
  tokenPrefix: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
}
