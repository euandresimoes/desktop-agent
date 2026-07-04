# TTS Streaming Architecture Design

## Goal

Implementar uma arquitetura de streaming de TTS robusta, segura e de baixa latencia, com reproducao progressiva no Electron enquanto os chunks ainda estao sendo gerados.

O objetivo nao e apenas "fazer tocar antes". O objetivo e criar uma base seria e estavel para:

- streaming de audio em tempo real
- legenda incremental sincronizada com a fala
- cancelamento seguro
- telemetria de runtime
- futura reutilizacao em outros fluxos do app

## Primary Decision

O streaming de TTS sera desenhado sobre WebSocket, nao sobre HTTP chunked.

O Electron nao falara diretamente com o `tts-server`. O unico ponto publico de entrada continuara sendo a `api`.

A `api` sera responsavel por normalizar o protocolo publico e esconder completamente o protocolo interno do `tts-server`.

## Why This Approach

### WebSocket over HTTP streaming

Escolhemos WebSocket porque:

- suporta bem audio incremental e eventos textuais no mesmo canal
- simplifica futura expansao para fluxos bidirecionais
- facilita cancelamento e controle de sessao
- evita retrabalho caso streaming precise crescer para alem de audio puro

### API as protocol boundary

Escolhemos a `api` como fronteira publica porque:

- desacopla o Electron do backend Python
- centraliza validacao, logs, metrics e tratamento de erro
- permite evoluir o `tts-server` sem quebrar o frontend
- mantem a arquitetura coerente com o restante do projeto

### Public protocol normalization

Escolhemos normalizar o protocolo publico na `api` porque:

- evita vazar detalhes internos de provider
- permite versionamento real da interface do app
- melhora seguranca e estabilidade de longo prazo

## Scope

### This project includes

- streaming de audio TTS em WebSocket
- chunks PCM para reproducao progressiva
- eventos textuais incrementais para legenda
- metricas no proprio stream
- cancelamento seguro de sessao
- uma sessao ativa por vez na UI inicial
- arquitetura interna pronta para multiplas sessoes

### This project does not include

- fallback automatico para TTS nao streaming
- conexao direta Electron -> `tts-server`
- STT streaming
- multiplexacao visivel de varias falas ao mesmo tempo na UI inicial

## High-Level Architecture

```text
Electron
  -> WebSocket publico
API
  -> TTS streaming gateway
  -> protocol normalization
  -> session lifecycle + validation + metrics
  -> WebSocket interno para tts-server
TTS Server
  -> provider runtime
  -> chunk generation
  -> internal stream protocol
Piper Provider
  -> synthesis backend
```

## Public Streaming Model

### Session model

Cada stream de TTS sera uma sessao identificada por `sessionId`.

A UI inicial mantera apenas uma sessao ativa por vez, cancelando a anterior automaticamente quando necessario.

A arquitetura interna, porem, sera desenhada para suportar varias sessoes simultaneas sem colisao de estado.

## Public Protocol

O protocolo publico sera versionado desde a v1.

### Envelope

Todas as mensagens publicas da `api` para o Electron usarao envelope comum:

```json
{
  "version": "v1",
  "type": "session.start",
  "sessionId": "tts_123",
  "timestamp": 1780000000000,
  "payload": {}
}
```

### Public message types

Mensagens previstas na v1:

- `session.start`
- `audio.chunk`
- `text.chunk`
- `metrics`
- `status`
- `warning`
- `session.complete`
- `session.cancelled`
- `session.error`

### `session.start`

Emitida quando a sessao foi aceita e inicializada.

Payload minimo:

- `voiceId`
- `provider`
- `sampleRate`
- `channels`
- `sampleFormat`

### `audio.chunk`

Contem audio incremental em PCM.

Payload minimo:

- `sequence`
- `chunkId`
- `encoding` = `pcm_s16le`
- `sampleRate`
- `channels`
- `frameCount`
- `durationMs`
- `audioBase64`

Observacoes:

- o protocolo publico usara Base64 por simplicidade e previsibilidade de serializacao
- o payload e binario semanticamente, mas encapsulado em mensagem JSON
- isso e menos eficiente do que frame binario puro, mas e mais simples para v1, mais inspecionavel e mais seguro para evolucao inicial

### `text.chunk`

Contem trechos incrementais para legenda.

Payload minimo:

- `sequence`
- `text`
- `isFinal`

Objetivo:

- permitir que a legenda apareca enquanto a fala esta sendo gerada
- nao depender de frase completa para atualizar a UI

### `metrics`

Contem telemetria incremental da sessao.

Payload minimo:

- `timeToFirstChunkMs`
- `audioChunksSent`
- `textChunksSent`
- `generatedAudioDurationMs`
- `elapsedMs`

### `status`

Eventos textuais de estado operacional.

Payload minimo:

- `code`
- `message`

Exemplos:

- `provider_loading`
- `provider_generating`
- `provider_flushing`

### `warning`

Eventos nao fatais, diagnosticaveis.

Payload minimo:

- `code`
- `message`

### `session.complete`

Emitida quando todos os chunks foram enviados com sucesso.

Payload minimo:

- `totalAudioChunks`
- `totalTextChunks`
- `totalDurationMs`
- `totalElapsedMs`

### `session.cancelled`

Emitida quando a sessao foi cancelada com sucesso.

Payload minimo:

- `reason`

### `session.error`

Erro terminal da sessao.

Payload minimo:

- `error`
- `details`
- `requestId`

## Internal Protocol Boundary

O `tts-server` podera usar protocolo interno diferente do publico.

A `api` sera a camada de traducao entre:

- protocolo interno do `tts-server`
- protocolo publico do app

Isso garante que:

- o frontend nao dependa de detalhes internos
- possamos trocar framing interno depois
- possamos otimizar binario interno sem quebrar o cliente

## Audio Format Decision

### Public audio chunk format

A v1 publica usara:

- PCM signed 16-bit little-endian
- mono inicialmente
- sample rate explicitado por mensagem

### Why PCM

Escolhemos PCM porque:

- reduz trabalho de decodificacao incremental
- facilita reproducao progressiva via `AudioContext`
- evita dependencia de demuxing complexo
- e mais previsivel para sincronizar legenda e cancelamento

## Electron Playback Strategy

O player do Electron sera redesenhado para tocar enquanto recebe dados.

### Player responsibilities

- abrir sessao de streaming com a `api`
- receber `audio.chunk` e `text.chunk`
- alimentar fila de audio local
- agendar reproducao incremental no `AudioContext`
- emitir legenda incremental para a UI
- aplicar cancelamento com fade-out curto
- encerrar sessao local ao receber `complete`, `cancelled` ou `error`

### Playback model

A recomendacao e usar um player baseado em `AudioContext`, nao `HTMLAudioElement`.

Razoes:

- `HTMLAudioElement` nao e ideal para agendamento incremental fino
- `AudioContext` permite controle melhor de buffer, latencia e fade-out
- facilita instrumentacao de estado e sincronizacao de chunks

### Cancellation behavior

Cancelamento deve ser seguro e perceptualmente limpo:

- parar imediatamente a geracao na origem
- encerrar recebimento da sessao
- interromper agendamento de novos chunks no player
- aplicar fade-out curtissimo de aproximadamente 20-40 ms no audio ja em reproducao

Nao havera fallback silencioso para o modo antigo.

Se o streaming falhar, o fluxo falha explicitamente.

## Text Streaming Strategy

O protocolo precisa suportar texto incremental nativamente.

O texto nao sera tratado como log auxiliar. Ele faz parte do produto.

Objetivos:

- legenda incremental ao lado direito da view
- futura sincronizacao com animacoes ou destaque de fala
- suporte a observabilidade e debugging

## API Responsibilities

O modulo de streaming na `api` deve ter responsabilidades separadas.

### Suggested modules

```text
apps/api/src/modules/tts-streaming/
  routes.ts
  gateway.ts
  protocol.ts
  session-manager.ts
  client.ts
  types.ts
```

### Responsibilities by file

#### `routes.ts`

- expoe endpoint WebSocket publico
- autentica e valida abertura da sessao

#### `gateway.ts`

- orquestra mensagens entre frontend e session manager

#### `protocol.ts`

- definicao das mensagens publicas v1
- encode/decode
- guards de validacao

#### `session-manager.ts`

- lifecycle de sessao
- cancelamento
- bookkeeping de metricas
- controle de estado por `sessionId`

#### `client.ts`

- cliente interno para comunicar com o `tts-server`

#### `types.ts`

- contratos puros de sessao e mensagens

## TTS Server Responsibilities

O `tts-server` precisara de uma camada de streaming separada da sintese completa atual.

### Suggested modules

```text
apps/tts-server/
  api/
    ws_routes.py
  core/
    streaming_engine.py
  providers/
    piper_streaming_provider.py
  services/
    pcm_chunker.py
    text_chunker.py
    session_metrics.py
```

Os nomes exatos podem variar, mas as responsabilidades devem permanecer isoladas.

### Core rules

- a engine atual de sintese completa nao deve virar um arquivo monolitico misto
- streaming deve entrar como fluxo paralelo bem separado
- provider streaming deve abstrair como chunks sao produzidos
- chunking de audio e de texto devem ser responsabilidades distintas

## Provider Strategy

Mesmo com `piper` sendo o unico provider atual, a arquitetura de streaming nao deve assumir provider unico no contrato publico.

O protocolo publico deve ser generico o suficiente para:

- `piper`
- futuros providers como `kokoro`
- diferencas internas de chunking

## Security and Stability Requirements

### Explicit requirements

- `api` como unica fronteira publica
- validacao de payloads de abertura de sessao
- versionamento do protocolo desde a v1
- cancelamento idempotente
- nenhuma queda silenciosa para fluxo legado
- erros estruturados no stream
- limites de sessao e limpeza de recursos em desconexao

### Session safety

A `api` deve tratar:

- cliente desconectado no meio da fala
- `tts-server` desconectado no meio da fala
- cancelamento duplicado
- chunks fora de ordem
- sessao concluida recebendo chunks extras

## Failure Policy

Falhas devem ser explicitas.

Nao havera:

- fallback automatico para `/speak` nao streaming
- tentativas silenciosas de trocar protocolo

Em caso de erro:

- a sessao emite `session.error`
- a UI encerra a sessao atual
- a telemetria e logs devem permitir diagnostico

## Performance Goals

### Priority order

1. baixa latencia para primeiro audio
2. estabilidade do stream
3. seguranca do protocolo
4. eficiencia incremental posterior

### Success indicators

- primeiro chunk audivel chega significativamente antes do TTS completo atual
- cancelamento corta a fala sem artefato audivel relevante
- legenda incremental aparece sem esperar o audio inteiro
- o player nao depende de montar arquivo WAV completo em memoria

## Compatibility Strategy

O endpoint HTTP atual de TTS completo deve continuar existindo inicialmente.

Motivo:

- preserva compatibilidade enquanto o streaming amadurece
- permite rollout incremental
- reduz risco operacional

Streaming sera uma nova capacidade, nao uma substituicao imediata.

## Testing Strategy

### Backend

- validacao do protocolo publico
- criacao e encerramento de sessao
- cancelamento idempotente
- traducao correta entre protocolo interno e publico
- erro estruturado em falha de provider

### Electron

- reproducao incremental de audio.chunk
- legenda incremental com `text.chunk`
- cancelamento com fade-out curto
- encerramento limpo em `complete`, `cancelled` e `error`

### Integrated

- abrir sessao
- receber `session.start`
- receber `audio.chunk`
- receber `text.chunk`
- receber `metrics`
- concluir com `session.complete`
- cancelar no meio do fluxo

## Recommended Rollout

### Phase 1

- spec
- plano de implementacao

### Phase 2

- protocolo publico na `api`
- cliente interno `api` -> `tts-server`
- sessao WebSocket no Electron

### Phase 3

- engine streaming no `tts-server`
- chunks PCM
- texto incremental

### Phase 4

- player incremental no Electron
- legenda incremental na UI
- cancelamento seguro

## Recommendation

A recomendacao final e implementar streaming de TTS sobre WebSocket, com protocolo publico versionado e normalizado na `api`, audio PCM incremental, eventos textuais para legenda e metricas no proprio stream.

Essa abordagem e a melhor combinacao entre:

- baixa latencia
- seguranca
- estabilidade
- extensibilidade futura

Ela segue melhor os objetivos do projeto do que HTTP chunked, SSE ou acoplamento direto do Electron ao `tts-server`.
