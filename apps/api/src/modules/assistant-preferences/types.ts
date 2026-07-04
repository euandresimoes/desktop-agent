export type AssistantPreferences = {
  agentName: string;
  responseLanguage: string;
  customSystemPrompt: string;
};

export type AssistantPreferencesPatch = Partial<AssistantPreferences>;

export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
  agentName: 'Desktop Agent',
  responseLanguage: 'Portuguese (Brazil)',
  customSystemPrompt: '',
};
