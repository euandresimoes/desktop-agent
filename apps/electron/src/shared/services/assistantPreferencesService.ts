import type { AppSettings } from "../types/app-settings";

const API_BASE = "http://localhost:35421/api/v1";

export type AssistantPreferencesPayload = Pick<
  AppSettings,
  "agentName" | "responseLanguage" | "customSystemPrompt"
>;

export async function syncAssistantPreferences(
  payload: AssistantPreferencesPayload,
) {
  const response = await fetch(`${API_BASE}/assistant-preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to sync assistant preferences");
  }

  return (await response.json()) as AssistantPreferencesPayload & {
    compiledSystemPrompt: string;
  };
}
