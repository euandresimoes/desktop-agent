# STT Streaming Architecture Design

## Goal

Adicionar suporte a streaming de STT em tempo real com entrada via `api` e transporte público por `WebSocket`, permitindo que o frontend mostre:

- uma linha parcial viva da fala atual do usuário
- uma lista de segmentos já confirmados no lado esquerdo da voice-turn view
- uma transcrição final consolidada ao encerrar a gravação

O desenho deve seguir os mesmos princípios aplicados ao streaming de TTS: `api` como ponto central de entrada, responsabilidades bem separadas, protocolo explícito, comportamento previsível e base preparada para múltiplos providers futuros.

## Context

Hoje o fluxo de voice turn funciona assim:

1. o frontend grava o áudio localmente
2. ao parar a gravação, envia o arquivo completo para a `api`
3. a `api` chama o `stt-server` para transcrição final
4. a resposta consolidada segue para `LLM` e depois `TTS`

Esse fluxo é funcional, mas perde uma oportunidade importante de UX:

- o usuário não vê sua fala aparecendo enquanto está falando
- o lado esquerdo da view fica subutilizado
- a sensação de “assistente vivo” só aparece no TTS

Também já temos uma direção arquitetural clara no projeto:

- `api` como camada pública estável
- `WebSocket` como transporte para fluxos contínuos
- providers encapsulados em engines dedicadas
- frontend reagindo a eventos textuais e de áudio, sem depender de detalhes internos do runtime

## Requirements

### Functional

1. O frontend deve poder abrir uma sessão de STT streaming pela `api`.
2. O frontend deve enviar chunks de áudio enquanto o usuário ainda está falando.
3. A `api` deve devolver eventos textuais parciais e confirmados durante a sessão.
4. O frontend deve mostrar:
   - um texto parcial vivo
   - uma lista acumulada de segmentos confirmados
5. Ao finalizar a gravação, a sessão deve produzir uma transcrição final consolidada.
6. A `LLM` deve continuar recebendo apenas a transcrição final consolidada, não os parciais.
7. O protocolo público deve suportar cancelamento explícito da sessão.
8. O sistema deve deixar claro quando um provider não suporta STT streaming.
9. A implementação inicial deve funcionar com o fluxo atual de voice turn sem quebrar o endpoint tradicional de transcrição final.

### Non-functional

1. `api` continua sendo o ponto central de entrada para o frontend.
2. O desenho deve permitir providers com e sem suporte real a streaming.
3. O protocolo deve ser determinístico, versionável e seguro.
4. A engine deve seguir SRP, com separação entre transporte, sessão, normalização de eventos e inferência do provider.
5. O sistema deve priorizar baixa latência sem sacrificar estabilidade.
6. O comportamento degradado deve falhar explicitamente, nunca simular compatibilidade silenciosa.

## Recommendation

Implementar `STT streaming` público via `WebSocket` na `api`, com sessões stateful e eventos textuais explícitos, enquanto o `stt-server` ganha uma interface interna de streaming por provider.

O frontend renderiza dois estados simultâneos no lado esquerdo da view:

- `partial segment`: linha viva da fala atual, sujeita a correções
- `confirmed segments`: blocos já estáveis e acumulados

Essa abordagem entrega UX realmente em tempo real, mantém o backend desacoplado e preserva uma transcrição final única para a LLM.

## Architecture

### High-level layout

O fluxo proposto será:

1. o frontend abre `ws /api/v1/stt-streaming/ws`
2. a `api` cria uma sessão de streaming de STT
3. o frontend envia chunks PCM do microfone durante a gravação
4. a `api` repassa os chunks para a engine de STT streaming
5. a engine emite eventos internos de hipótese parcial, segmento confirmado e finalização
6. a `api` normaliza esses eventos e os envia ao frontend
7. ao encerrar, o frontend usa a transcrição final consolidada no fluxo de `voice turn`

### Public boundary

O frontend nunca falará diretamente com `apps/stt-server`.

Toda comunicação passa pela `api`, que será responsável por:

- abrir e encerrar sessões
- validar formato e ritmo dos chunks
- selecionar o modelo/provider STT ativo
- traduzir erros internos em eventos públicos consistentes
- expor capabilities do provider para o frontend

### Internal boundary

O `stt-server` será responsável apenas por:

- gerenciar a engine de STT streaming
- manter estado por sessão
- entregar eventos internos normalizados por provider
- consolidar a transcrição final

Ele não deve conhecer UI, semantics do voice turn, nem policy de exibição de captions.

## Session model

### Session lifecycle

Cada sessão de STT streaming terá este ciclo:

1. `session.open`
2. `session.ready`
3. múltiplos `audio.chunk`
4. zero ou mais eventos `partial_segment`
5. zero ou mais eventos `confirmed_segment`
6. `session.commit` quando o usuário parar de gravar
7. `session.final`
8. `session.close`

Também deve existir:

- `session.cancel`
- `session.error`

### Session state

Cada sessão manterá pelo menos:

- `sessionId`
- `requestId`
- `modelId`
- `provider`
- `audioFormat`
- `openedAt`
- buffer/janela corrente de áudio
- lista acumulada de segmentos confirmados
- segmento parcial atual
- transcrição final consolidada quando disponível

## Public WebSocket protocol

### Client to API

Mensagens do frontend para a `api`:

- `session.start`
  - inicia a sessão
  - informa metadados do áudio
- `audio.chunk`
  - envia bytes PCM base64 ou binário conforme a estratégia final de framing
- `session.commit`
  - sinaliza fim da fala e pede consolidação final
- `session.cancel`
  - cancela a sessão explicitamente
- `session.ping`
  - opcional para health/keepalive

### API to client

Mensagens públicas da `api` para o frontend:

- `session.ready`
  - sessão aceita
  - capabilities efetivas e provider resolvido
- `transcript.partial`
  - texto parcial da fala atual
  - substitui o parcial anterior
- `transcript.confirmed`
  - novo segmento estável
  - entra na lista acumulada de confirmados
- `transcript.final`
  - transcrição consolidada final
- `metrics`
  - latência parcial, volume de áudio processado, elapsed da sessão
- `session.cancelled`
  - cancelamento concluído
- `session.error`
  - erro determinístico e user-friendly

### Event semantics

#### `transcript.partial`

Representa apenas o segmento vivo atual. Pode mudar ao longo do tempo. O frontend não deve acumulá-lo como definitivo.

#### `transcript.confirmed`

Representa um segmento já estável. Deve ser acrescentado à lista de confirmados e não deve ser alterado visualmente depois de emitido.

#### `transcript.final`

Representa a consolidação completa da sessão. É esse texto que seguirá para `LLM`.

## Provider architecture

### New internal contract

Além do contrato atual de transcrição final, cada provider poderá implementar uma interface de streaming conceitual:

- `supports_streaming() -> bool`
- `open_stream_session(config) -> ProviderStreamSession`
- `push_audio(session, chunk) -> list[StreamingEvent]`
- `commit(session) -> list[StreamingEvent]`
- `cancel(session) -> None`
- `close(session) -> None`

### Provider session responsibility

Cada provider controla seus próprios detalhes internos:

- janela de áudio
- regras de estabilidade
- geração de hipóteses parciais
- consolidação em segmentos confirmados

O core não deve conter heurísticas específicas de `faster-whisper` ou futuros providers.

### Initial provider strategy

#### Faster-whisper

Na primeira etapa, `faster-whisper` deve ser o provider prioritário para streaming.

A implementação pode ser incremental:

- manter uma janela corrente de áudio por sessão
- rodar inferência parcial em intervalos controlados
- emitir `partial` e `confirmed` por segmentos estáveis
- consolidar o texto final no `commit`

#### Transformers

Inicialmente, `transformers` pode ficar sem suporte a streaming real.

Nesse caso:

- o provider reporta `supports_streaming = false`
- a `api` falha explicitamente se o frontend tentar abrir STT streaming com esse modelo ativo
- o frontend informa claramente que o modelo suporta apenas transcrição final tradicional

Essa decisão é mais segura do que criar um streaming “fake” ou instável cedo demais.

## API module design

### New module

Criar um módulo dedicado em `apps/api/src/modules/stt-streaming/` com responsabilidades semelhantes às do `tts-streaming`:

- `routes.ts`
- `protocol.ts`
- `session-manager.ts`
- `gateway.ts`
- `types.ts`
- `capabilities.ts`

### Responsibilities

#### `routes.ts`

- registra o endpoint público websocket
- faz validação inicial de payload
- conecta socket ao session manager

#### `protocol.ts`

- define eventos públicos
- valida mensagens de entrada e saída
- concentra serialização/desserialização

#### `session-manager.ts`

- cria, armazena e encerra sessões
- protege contra commit/cancel duplicados
- aplica timeouts e cleanup seguro

#### `gateway.ts`

- orquestra a conversa entre `api` e `stt-server`
- converte eventos internos em protocolo público

#### `capabilities.ts`

- expõe se o provider/modelo atual suporta STT streaming
- informa restrições públicas necessárias para o frontend

## STT server design

### New internal layout

O `apps/stt-server` deve ganhar uma trilha paralela à transcrição tradicional, sem misturar tudo no endpoint atual:

- `streaming/`
  - `types.py`
  - `engine.py`
  - `session_manager.py`
  - `event_mapper.py`

### Engine responsibilities

#### Streaming engine

- resolve provider ativo
- verifica se ele suporta streaming
- cria e administra sessões
- recebe chunks
- emite eventos internos normalizados

#### Session manager

- mantém estado em memória por sessão
- controla cleanup
- aplica regras de commit/cancel/timeout

#### Event mapper

- traduz saídas internas do provider para eventos estáveis do core
- evita vazar detalhes específicos do provider para fora

## Audio transport strategy

### Recommended initial format

Para a primeira versão, o frontend deve enviar:

- PCM mono
- sample rate previsível
- chunks curtos e frequentes

Isso evita variabilidade excessiva no lado do backend e simplifica a inferência parcial.

### Chunk cadence

A inferência parcial não deve rodar a cada micro-chunk recebido.

Em vez disso, a sessão deve:

- acumular pequenos pedaços de áudio
- disparar inferência parcial em cadência controlada
- descartar parciais excessivamente frequentes

Isso mantém a UI viva sem saturar CPU.

## Frontend behavior

### Voice turn UI

O lado esquerdo da voice-turn view deve passar a ter dois blocos:

- bloco superior: `partial speech`
- bloco inferior: `confirmed speech`

Comportamento esperado:

- `partial speech` substitui o texto anterior a cada novo evento parcial
- `confirmed speech` acumula segmentos confirmados em ordem
- ao receber `transcript.final`, o frontend pode limpar o parcial e manter a forma consolidada

### Recording flow

Enquanto estiver `recording`, o frontend:

1. abre a sessão STT streaming
2. envia chunks do microfone
3. renderiza parciais e confirmados em tempo real

Quando o usuário parar:

1. envia `session.commit`
2. aguarda `transcript.final`
3. usa esse texto final para o restante do voice turn

### Failure behavior

Se o modelo ativo não suportar streaming:

- o frontend não deve fingir streaming
- a capability deve indicar indisponibilidade
- a UI deve cair para o fluxo tradicional de transcrição final

## Error handling

O sistema deve diferenciar claramente:

- provider sem suporte a streaming
- sessão inválida
- formato de áudio incompatível
- chunk malformado
- timeout de sessão
- falha de inferência parcial
- falha de commit final

As mensagens devem sair do backend já boas o suficiente para:

- toast
- console do navegador
- logs internos da `api`
- logs do `stt-server`

## Security and stability

### Guardrails

Cada sessão deve ter:

- limite de duração
- limite de chunk size
- limite de backlog
- cleanup obrigatório em cancelamento, erro ou disconnect

### Explicit failure

Se algum provider não oferecer comportamento estável para streaming, ele deve reportar isso explicitamente em capabilities e no open da sessão. O sistema não deve simular “tempo real” falso no STT.

## Testing strategy

### Unit

- protocolo público aceita apenas mensagens válidas
- `session-manager` bloqueia estados inválidos
- capability reflete corretamente provider com e sem suporte
- gateway traduz eventos internos corretamente

### Integration

- websocket público abre e fecha corretamente
- chunks geram `partial` e `confirmed`
- `commit` gera `final`
- `cancel` limpa sessão
- provider sem suporte falha explicitamente

### Regression

- fluxo tradicional `/transcribe` continua funcionando
- voice turn atual continua operando sem streaming quando necessário
- erro de STT streaming não deixa sessão zumbi

## Rollout plan

### Phase 1

- desenhar protocolo público e capabilities
- criar módulo `stt-streaming` na `api`
- criar esqueleto streaming no `stt-server`

### Phase 2

- implementar sessões e ciclo de vida
- integrar frontend ao websocket de STT streaming
- renderizar parcial + confirmados na voice-turn view

### Phase 3

- implementar provider inicial com streaming real
- consolidar commit final e encaixe com voice turn
- reforçar logs, métricas e fallbacks

### Phase 4

- adicionar suporte gradual a novos providers
- evoluir thresholds, heurísticas de estabilidade e tuning de latência

## Final recommendation

Começar com `api` como boundary pública, `WebSocket` como transporte, `faster-whisper` como primeiro provider de streaming real e `confirmed segments` por frases/segmentos estáveis.

Essa combinação é a mais consistente com a arquitetura atual, entrega UX fortemente perceptível no frontend e preserva segurança arquitetural para futuras expansões, incluindo streaming de LLM e TTS mais avançado no mesmo modelo mental de sessões e eventos.
