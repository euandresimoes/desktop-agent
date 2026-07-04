# TTS Provider Architecture Design

## Goal

Refatorar o `apps/tts-server` para seguir a mesma arquitetura modular do `apps/stt-server`, separando `api`, `core`, `providers` e `services`, com um `engine` central e suporte inicial a provider `piper`.

O objetivo principal e imediato nao e adicionar streaming nem novos providers agora. O objetivo e criar uma base limpa, previsivel e extensivel para que `piper`, `kokoro` e futuros providers possam coexistir sem retrabalho estrutural.

## Current Problems

Hoje o `tts-server` concentra em `server.py` responsabilidades demais:

- leitura de configuracao por variavel de ambiente
- validacao e resolucao de voz ativa
- cache de vozes carregadas
- loading do provider Piper
- sintese de audio
- escrita temporaria de WAV
- rotas HTTP
- tratamento de erro

Isso dificulta:

- isolar responsabilidades
- testar partes individualmente
- introduzir novos providers
- adicionar streaming depois
- manter consistencia com o `stt-server`

## Decision

Adotar uma arquitetura 1:1 com o `stt-server`, adaptando a nomenclatura e os contratos para TTS.

Nao vamos fazer uma versao reduzida. A decisao e espelhar de fato o padrao ja aprovado no STT para manter consistencia arquitetural no projeto inteiro.

## Target Architecture

### Folder structure

```text
apps/tts-server/
  main.py
  server.py
  api/
    __init__.py
    errors.py
    routes.py
    schemas.py
  core/
    __init__.py
    config.py
    engine.py
    registry.py
    types.py
    voice_resolver.py
  providers/
    __init__.py
    base.py
    piper_provider.py
  services/
    __init__.py
    audio_buffer.py
    voice_cache.py
```

### Responsibilities

#### `main.py`

- cria a app FastAPI
- registra exception handlers
- monta `registry`, `resolver`, `cache` e `engine`
- registra providers disponiveis
- monta `default_config`
- tenta preload da voz default sem derrubar o servidor em caso de falha
- inclui as rotas da API

#### `server.py`

- compat layer minima para continuar suportando `uvicorn server:app`
- apenas reexporta `app` de `main.py`

#### `api/routes.py`

- endpoints HTTP do TTS
- conversao de request HTTP para `SynthesisRequest`
- serializacao do `SynthesisResult`

#### `api/errors.py`

- handlers globais de erro FastAPI
- resposta estruturada com:
  - `error`
  - `details`
  - `requestId`
  - `source`

#### `core/config.py`

- leitura de env vars do TTS
- funcoes utilitarias para defaults e normalizacao
- construcao do `ProviderVoiceConfig` default

#### `core/types.py`

- tipos centrais do runtime
- chave de cache
- request/response de sintese
- resultado de validacao

#### `core/registry.py`

- registro de providers TTS por nome
- lookup do provider correto

#### `core/voice_resolver.py`

- valida config e caminhos antes de synthese
- delega a validacao especifica ao provider

#### `core/engine.py`

- ponto central de orquestracao
- resolve provider
- valida voz/config
- constroi `ProviderVoiceKey`
- carrega do cache ou faz load do provider
- executa sintese

#### `providers/base.py`

- interface abstrata de provider TTS

Metodos previstos:

- `validate_voice(config)`
- `load_voice(config)`
- `synthesize(loaded_voice, request)`

#### `providers/piper_provider.py`

- implementacao concreta do Piper
- encapsula `PiperVoice.load(...)`
- executa sintese WAV

#### `services/voice_cache.py`

- cache thread-safe de vozes carregadas
- mesma ideia do `ModelCache` do STT

#### `services/audio_buffer.py`

- abstrai a producao do audio final
- no primeiro momento retorna bytes WAV completos
- ja nasce como camada separada para facilitar `stream_synthesize()` no futuro

## Core Types

Os nomes vao espelhar o STT.

### `ProviderVoiceConfig`

Campos iniciais:

- `voice_id`
- `provider`
- `model_path`
- `config_path`
- `length_scale`
- `noise_scale`
- `noise_w`

### `ProviderVoiceKey`

Usado no cache:

- `provider`
- `voice_id`
- `model_path`
- `config_path`

### `SynthesisRequest`

- `text`
- `config`
- `request_id` opcional

### `SynthesisResult`

- `audio_bytes`
- `audio_content_type`
- `duration_ms`
- `provider`
- `voice_id`

### `ValidationResult`

- `valid`
- `reason`
- `normalized_model_path`
- `normalized_config_path`

## API Surface

O comportamento funcional deve continuar o mesmo.

### `GET /health`

Retorna:

- `ok`
- `defaultVoiceId`
- `defaultProvider`
- `defaultModelPath`
- `defaultConfigPath`
- `cachedVoices`

### `POST /speak`

Recebe:

- `text`
- `voiceId`
- `provider`
- `modelPath`
- `configPath`
- `lengthScale`
- `noiseScale`
- `noiseW`

Retorna:

- bytes de audio WAV

O endpoint continua respondendo audio completo, nao streaming.

## Provider Strategy

Mesmo existindo apenas `piper` agora, o `tts-server` deve nascer com registry e provider abstraction plural.

Isso e importante porque:

- `kokoro` deve entrar depois sem reescrever o servidor
- outros runtimes podem exigir validacao e loading diferentes
- streaming futuro pode variar por provider

O nome inicial do provider sera:

- `piper`

## Validation Rules

O `piper_provider` deve validar:

- `model_path` existe
- `config_path` existe
- os caminhos normalizados fazem sentido

Falhas de validacao devem impedir preload e synthese, mas nao derrubar o servidor inteiro.

## Error Handling

Seguir o mesmo padrao atual do `stt-server`.

- excecoes nao tratadas viram payload estruturado
- stack trace completa vai para o terminal
- preload failure nao derruba boot
- erros por request devem carregar `requestId`

## Caching

O cache deve funcionar por combinacao de:

- `provider`
- `voice_id`
- `model_path`
- `config_path`

Isso garante que:

- trocar arquivo de voz gera nova entrada
- mesmo `voiceId` com outro provider nao conflita

## Preload Behavior

No boot:

- `main.py` monta a config default
- tenta preload da voz default
- se falhar, loga `voice-preload-failed`
- a API continua subindo

Isso replica a filosofia atual do STT.

## Streaming Readiness

Nao vamos implementar streaming agora, mas a arquitetura deve facilitar isso depois.

Preparos obrigatorios:

- `engine` desacoplado da camada HTTP
- `audio_buffer.py` separado do endpoint
- `SynthesisResult` estruturado
- provider abstraido

Preparos que nao entram agora:

- endpoints chunked
- WebSocket
- `stream_synthesize()`

## Migration Plan

Durante a refatoracao:

- manter `server.py` como ponto de entrada compativel
- preservar o endpoint `/health`
- preservar o endpoint `/speak`
- preservar carga da voz default por env vars

O objetivo e zero mudanca funcional externa neste passo.

## Testing Strategy

Validacoes minimas:

- Python compile sem erro
- boot do `tts-server` com voz default valida
- `GET /health` funcionando
- `POST /speak` retornando WAV
- preload failure nao derruba processo
- erro de caminho invalido retorna payload estruturado

## Non-Goals

Esta refatoracao nao inclui:

- streaming de TTS
- novo provider `kokoro`
- mudancas no frontend
- alteracao do protocolo HTTP

## Recommendation

A recomendacao final e prosseguir com a refatoracao 1:1 do `tts-server` para o mesmo padrao do `stt-server`, mantendo comportamento externo identico e preparando a base para multiplos providers e streaming futuro.
