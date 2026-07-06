# STT Parakeet Provider Design

## Goal

Adicionar suporte dedicado a modelos STT Parakeet na arquitetura modular atual, mantendo `faster-whisper` e `transformers` estáveis e sem criar condicionais especiais dentro do provider genérico.

## Approach

O Parakeet será implementado como um provider próprio chamado `parakeet`. Ele continuará usando o ecossistema `transformers` por baixo, mas com validação, carregamento, dependências e mensagens de erro específicas. Isso preserva SRP e deixa a evolução futura mais segura.

## Scope

- Criar `ParakeetProvider` no `stt-server`
- Registrar o novo provider no engine principal
- Expandir os tipos e validações da `api`
- Ensinar o downloader a detectar bundles Parakeet compatíveis
- Expor `parakeet` no frontend onde STT provider é usado
- Instalar dependências Python necessárias para modelos Parakeet

## Non-Goals

- Streaming STT para Parakeet nesta etapa
- Otimizações de performance específicas de Parakeet nesta etapa
- Suporte genérico a todo modelo ASR arbitrário do Hugging Face sem heurística mínima

## Validation Rules

Um bundle Parakeet local/Hugging Face será considerado compatível quando:

- houver `config.json`
- houver um arquivo de pesos compatível como `model.safetensors`, `pytorch_model.bin` ou `model.bin`
- houver artefatos mínimos de processor/feature extractor tokenizer usados por modelos Transformers ASR
- o `config.json` ou metadados do bundle indiquem família Parakeet/NVIDIA NeMo Parakeet por heurística dedicada

## Error Handling

- Dependências faltantes devem produzir erro explícito com instrução de instalação
- Bundles incompatíveis devem informar claramente se o problema é “não é Parakeet”, “faltam arquivos” ou “provider incorreto”
- O downloader deve rotular arquivos Parakeet compatíveis corretamente, em vez de classificá-los como `transformers` genérico

## Files

- `apps/stt-server/providers/parakeet_provider.py`
- `apps/stt-server/main.py`
- `apps/stt-server/requirements.txt`
- `apps/api/src/modules/stt/types.ts`
- `apps/api/src/modules/stt/services.ts`
- `apps/api/src/modules/hub-downloads/services.ts`
- `apps/electron/src/shared/services/hubDownloadsService.ts`
- `apps/electron/src/shared/components/Downloader/AIModelDownloaderModal.vue`
- `apps/electron/src/views/voice-turn/services/settingsService.ts`

## Success Criteria

- Um modelo Parakeet compatível pode ser baixado, registrado e ativado
- O backend usa `parakeet` explicitamente no modelo salvo
- A transcrição funciona sem cair no provider `transformers` genérico
- Erros de dependência aparecem de forma clara quando faltarem libs Python
