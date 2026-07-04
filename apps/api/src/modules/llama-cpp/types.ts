export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatInput = {
  messages: ChatMessage[];
};

export type ChatOutput = {
  message: string;
  modelId: string;
  modelName: string;
};
