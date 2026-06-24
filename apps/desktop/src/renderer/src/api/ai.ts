import { apiGet } from "./client";

/**
 * In-app AI tagging status (EPIC-D4). Never carries the API key — only the
 * selected provider, whether a key is set, and whether tagging is usable.
 */
export interface AiStatus {
  provider: string | null;
  has_key: boolean;
  enabled: boolean;
  supported: string[];
}

export const ai = {
  status: () => apiGet<AiStatus>("/api/ai/status"),
};
