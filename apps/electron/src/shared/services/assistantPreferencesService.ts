import type { AppSettings } from "../types/app-settings";
import { fetchJsonOrThrow } from "../utils/http";

const API_BASE = "http://localhost:35421/api/v1";

export type AssistantPreferencesPayload = Pick<
  AppSettings,
  "agentName" | "responseLanguage" | "customSystemPrompt"
>;

export async function syncAssistantPreferences(
  payload: AssistantPreferencesPayload,
) {
  return await fetchJsonOrThrow<AssistantPreferencesPayload & {
    compiledSystemPrompt: string;
  }>(
    `${API_BASE}/assistant-preferences`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Failed to sync assistant preferences",
  );
}
