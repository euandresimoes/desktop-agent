# STT Provider Architecture Design

## Goal

Refatorar o `apps/stt-server` para uma arquitetura modular de providers, mantendo um único processo FastAPI, suportando inicialmente `faster-whisper` e `transformers`, e garantindo que todo modelo STT instalado seja materializado em `storage/stt-models/...` como asset gerenciado pela aplicação.

## Context

Hoje o `apps/stt-server/server.py` concentra configuração, cache, preload, carregamento de modelo, inferência e API em um único arquivo. Isso dificulta:

- adicionar novos runtimes STT
- validar corretamente formatos de modelo
- controlar onde os arquivos realmente ficam salvos
- exibir/abrir a pasta do modelo no frontend
- remover arquivos instalados com previsibilidade

Também existe um problema funcional: alguns modelos STT acabam sendo resolvidos via cache externo do Python/Hugging Face em vez de virarem assets locais gerenciados pelo app. Isso quebra a expectativa de UX e torna o ciclo de download, exclusão e abertura de pasta inconsistente.

## Requirements

### Functional

1. O `stt-server` deve continuar sendo um único processo FastAPI.
2. O sistema deve suportar inicialmente dois providers:
   - `faster-whisper`
   - `transformers`
3. Cada modelo STT salvo deve registrar um `provider` explícito.
4. Todo modelo STT instalado deve ser salvo em `storage/stt-models/<model-id>/...`.
5. O runtime não deve depender de cache externo do Python como fonte principal de execução.
6. O fluxo de download/importação deve detectar ou sugerir provider, mas o valor final salvo deve ser explícito.
7. O backend deve validar o bundle do modelo antes de marcá-lo como instalado/ativo.
8. A exclusão de um modelo deve remover os arquivos gerenciados correspondentes.
9. O frontend deve conseguir abrir a pasta local do modelo STT com caminho previsível.

### Non-functional

1. Separação clara de responsabilidades seguindo SRP.
2. Core estável e desacoplado dos detalhes de cada provider.
3. Estrutura preparada para futuros providers como `sherpa-onnx`.
4. Erros claros e determinísticos para formatos incompatíveis.
5. Possibilidade de cache em memória por provider/modelo sem duplicar lógica na API.

## Architecture

### High-level layout

O `apps/stt-server` será reorganizado em módulos internos:

- `main.py`
  - inicia FastAPI
  - registra rotas
  - monta dependências de aplicação
- `api/`
  - `routes.py`
  - `schemas.py`
- `core/`
  - `types.py`
  - `config.py`
  - `engine.py`
  - `registry.py`
  - `model_resolver.py`
- `providers/`
  - `base.py`
  - `faster_whisper_provider.py`
  - `transformers_provider.py`
- `services/`
  - `audio_loader.py`
  - `model_storage.py`
  - `model_installer.py`
  - `model_cache.py`

### Provider contract

Cada provider implementará uma interface comum, conceitualmente:

- `provider_name`
- `validate_model(model_record) -> ValidationResult`
- `load_model(model_record) -> LoadedModel`
- `transcribe(loaded_model, request) -> TranscriptionResult`

O `core/engine.py` não saberá detalhes de `faster-whisper` ou `transformers`. Ele apenas:

1. recebe a requisição
2. resolve o provider via `model_resolver`
3. pede o modelo carregado ao `model_cache`
4. delega a inferência ao provider

### Registry and resolution

`core/registry.py` será responsável por registrar e expor providers disponíveis.

`core/model_resolver.py` seguirá esta regra:

1. se o modelo salvo possui `provider`, usar esse valor
2. se o provider não existir no registry, falhar com erro claro
3. auto-detect só é permitido na fase de importação/download, nunca no runtime normal

Essa decisão torna o runtime previsível e evita heurísticas diferentes entre execuções.

## Model storage strategy

### Canonical rule

Todo modelo STT instalado deve ser salvo em:

`storage/stt-models/<model-id>/`

O app deve sempre executar a partir desse storage gerenciado.

### Faster-whisper

`faster-whisper` aceita modelos convertidos para CTranslate2. Portanto:

- modelos oficiais por alias ou repositório remoto não devem permanecer apenas como referência remota
- o fluxo de instalação deve materializar os arquivos convertidos no storage local
- bundles locais devem ser validados antes do cadastro

### Transformers

Para `transformers`, o instalador deve baixar/sincronizar o snapshot do modelo para a pasta gerenciada:

- pesos
- tokenizer/processor
- configs necessárias

Depois disso, o provider roda sempre apontando para a pasta local em `storage/stt-models/...`.

### Installer boundary

`services/model_installer.py` será a única camada responsável por:

- importar modelo local
- baixar modelo remoto
- sugerir/detectar provider na instalação
- validar estrutura final
- copiar/salvar na pasta canônica

O provider não deve ser responsável pela política de persistência do modelo.

## Data model changes

Os registros de modelo STT no backend devem passar a conter pelo menos:

- `id`
- `name`
- `provider`
- `modelSource`
- `modelPath`
- `device`
- `computeType`
- `language`
- `beamSize`
- `vadFilter`
- `runtimeOptions` opcional

`modelPath` deve sempre apontar para a pasta/asset local gerenciado, não para cache externo efêmero.

## API behavior

### Runtime API

O endpoint de transcrição continua simples, mas o core usa o provider configurado do modelo ativo.

### Management API

Os endpoints de modelos STT devem:

- aceitar `provider` explícito
- validar compatibilidade com o provider escolhido
- recusar modelos sem estrutura adequada
- expor `modelPath` gerenciado para o frontend

## Error handling

O sistema deve distinguir:

- provider não suportado
- bundle incompleto
- formato incompatível com o provider
- falha de download/sincronização
- falha de inferência

As mensagens devem ser específicas o suficiente para aparecer em toast/log sem ambiguidade.

O preload de modelo no boot não deve derrubar o processo inteiro. O servidor sobe e reporta o estado inválido no healthcheck/log.

## Testing strategy

### Unit

- resolver escolhe o provider correto
- registry falha para provider ausente
- validação de bundle `faster-whisper`
- validação de snapshot `transformers`
- `model_storage` resolve caminhos previsíveis

### Integration

- instalar modelo `faster-whisper` cria pasta em `storage/stt-models/...`
- instalar modelo `transformers` cria pasta em `storage/stt-models/...`
- transcrever com cada provider usa o provider salvo
- remover modelo apaga a pasta gerenciada

### Regression

- abrir pasta do modelo STT no frontend funciona
- trocar modelo ativo não depende de cache externo
- modelo inválido não derruba o boot do `stt-server`

## Rollout plan

### Phase 1

- extrair a arquitetura interna do `stt-server`
- implementar `registry`, `engine`, `model_cache`, provider base
- migrar `faster-whisper` para provider

### Phase 2

- implementar provider `transformers`
- ajustar modelo STT para armazenar `provider`
- adaptar validação e instalação

### Phase 3

- ajustar downloader/frontend para refletir compatibilidade por provider
- garantir abertura de pasta e remoção previsível

## Recommendation

Implementar com `provider` explícito salvo no modelo, auto-detect apenas na instalação e storage gerenciado obrigatório para todos os modelos STT. Essa combinação é a mais segura, previsível e compatível com clean architecture para o estágio atual do projeto.
