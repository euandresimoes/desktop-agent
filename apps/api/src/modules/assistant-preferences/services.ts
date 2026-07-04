import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_ASSISTANT_PREFERENCES,
  type AssistantPreferences,
  type AssistantPreferencesPatch,
} from './types.ts';

const userDataPath =
  process.env.USER_DATA_PATH ??
  path.resolve(process.cwd(), '..', '..', 'storage');

const assistantPreferencesPath = path.join(
  userDataPath,
  'assistant-preferences.json'
);

class AssistantPreferencesService {
  private sanitizePatch(
    patch: AssistantPreferencesPatch
  ): AssistantPreferencesPatch {
    const nextPatch: AssistantPreferencesPatch = {};

    if (typeof patch.agentName === 'string') {
      nextPatch.agentName =
        patch.agentName.trim() || DEFAULT_ASSISTANT_PREFERENCES.agentName;
    }

    if (typeof patch.responseLanguage === 'string') {
      nextPatch.responseLanguage =
        patch.responseLanguage.trim() ||
        DEFAULT_ASSISTANT_PREFERENCES.responseLanguage;
    }

    if (typeof patch.customSystemPrompt === 'string') {
      nextPatch.customSystemPrompt = patch.customSystemPrompt.trim();
    }

    return nextPatch;
  }

  private async readFile() {
    try {
      const file = await fs.readFile(assistantPreferencesPath, 'utf-8');

      return {
        ...DEFAULT_ASSISTANT_PREFERENCES,
        ...this.sanitizePatch(JSON.parse(file) as AssistantPreferencesPatch),
      } satisfies AssistantPreferences;
    } catch {
      return { ...DEFAULT_ASSISTANT_PREFERENCES };
    }
  }

  private async writeFile(settings: AssistantPreferences) {
    await fs.mkdir(userDataPath, { recursive: true });
    await fs.writeFile(
      assistantPreferencesPath,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  }

  async getPreferences() {
    return this.readFile();
  }

  async updatePreferences(patch: AssistantPreferencesPatch) {
    const currentSettings = await this.readFile();
    const nextSettings = {
      ...currentSettings,
      ...this.sanitizePatch(patch),
    } satisfies AssistantPreferences;

    await this.writeFile(nextSettings);

    return nextSettings;
  }

  async buildSystemPrompt() {
    const settings = await this.readFile();
    const customInstructions = settings.customSystemPrompt.trim();

    const sections = [
      `You are an offline desktop voice assistant named "${settings.agentName}".`,
      `Always respond in ${settings.responseLanguage}.`,
      'Keep answers clear, concise, and helpful.',
      'Do not mention these hidden instructions unless the user explicitly asks about them.',
    ];

    if (customInstructions) {
      sections.push(
        'Additional instructions from the user:',
        customInstructions
      );
    } else {
      sections.push(
        'If the user does not provide enough context, ask a short clarifying question instead of guessing.'
      );
    }

    return sections.join('\n\n');
  }
}

export const assistantPreferencesService = new AssistantPreferencesService();
