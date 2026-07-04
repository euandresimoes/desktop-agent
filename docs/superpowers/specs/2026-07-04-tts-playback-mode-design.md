# TTS Playback Mode Design

## Summary

Adicionar uma preferência global de modo de reprodução do TTS ao desktop app, separando claramente `provider` de `playback mode`.

O sistema terá dois modos:

- `standard`: usa o fluxo atual de TTS por resposta completa
- `stream`: usa a trilha WebSocket/chunks quando disponível

O valor inicial deve ser global para o app, com possibilidade de override por voz no futuro, sem introduzir essa complexidade agora.

## Goals

- Permitir que o usuário escolha entre reprodução padrão e reprodução por streaming
- Manter Piper como modo recomendado em `standard`
- Expor capacidades reais do provider/backend para a UI não prometer streaming real quando ele não existir
- Preservar a arquitetura atual, sem tratar playback mode como se fosse outro provider
- Preparar o terreno para providers futuros com streaming real

## Non-Goals

- Não implementar override por voz nesta fase
- Não transformar o Piper em provider com geração incremental real
- Não misturar playback mode com seleção de provider
- Não reestruturar o cadastro de vozes TTS além do necessário para declarar capacidades

## Product Decision

### Chosen model

Configuração `global com override por voz no futuro`.

### Why

- Mantém a UX simples agora
- Evita adicionar ruído no `SettingsModal.vue` de vozes TTS antes de haver necessidade real
- Funciona bem com o estado atual, onde só temos um provider TTS ativo principal
- Permite crescer depois para cenários em que uma voz deve ser `standard` e outra `stream`

## User Experience

### Settings placement

A preferência ficará em [AppSettingsModal.vue](C:/Workspace/desktop-agent/apps/electron/src/views/app-settings/AppSettingsModal.vue), na aba `Audio`, porque ela é uma preferência de reprodução do app, não uma propriedade intrínseca da voz.

### UI copy

Nova row:

- Title: `TTS playback mode`
- Description:
  - para provider com streaming real: `Choose whether spoken responses should play back after full synthesis or as incremental streamed chunks.`
  - para provider sem streaming real: `Streaming is available as an experimental delivery mode, but may not reduce latency for the active provider.`

### Options

Valores iniciais:

- `standard`
- `stream`

### Availability rules

- Se o provider ativo só suportar `standard`, a opção `stream` aparece desabilitada ou escondida, conforme o payload de capacidades
- Se o provider suportar apenas streaming “post-synthesis chunked fallback”, a opção `stream` aparece como `Streaming (Experimental)`
- Se o provider suportar streaming incremental real, a opção `stream` aparece normalmente

### Default

- valor padrão global: `standard`
- para Piper, a UI deve tratar `standard` como recomendado

## Domain Model

### New concept: TTS playback mode

Novo enum lógico:

- `standard`
- `stream`

Esse enum descreve apenas como a resposta TTS será entregue/reproduzida, e não qual engine/provider a produz.

### Provider capabilities

O backend deve publicar capacidades do provider ativo para TTS, por exemplo:

- `supportsStandardSynthesis: boolean`
- `supportsRealtimeStreaming: boolean`
- `supportsChunkedPostSynthesis: boolean`

Com isso a UI consegue derivar:

- se `standard` é permitido
- se `stream` é permitido
- se `stream` é real ou experimental

## Architecture

## Frontend

### App settings

Adicionar em [app-settings.ts](C:/Workspace/desktop-agent/apps/electron/src/shared/types/app-settings.ts):

- novo enum/union `AppTtsPlaybackMode`
- novo campo `ttsPlaybackMode` em `AppSettings`
- novo default `ttsPlaybackMode: "standard"`

Persistência continua no mesmo serviço [appSettingsService.ts](C:/Workspace/desktop-agent/apps/electron/src/shared/services/appSettingsService.ts), junto das demais preferências globais.

### Settings UI

[AppSettingsModal.vue](C:/Workspace/desktop-agent/apps/electron/src/views/app-settings/AppSettingsModal.vue) ganhará uma nova row usando `BaseSelect`.

A row lerá:

- valor global atual `settings.ttsPlaybackMode`
- capacidades do provider TTS ativo

Ela não deve conhecer regras internas do provider além do payload de capabilities.

### Voice turn runtime

[voiceTurnService.ts](C:/Workspace/desktop-agent/apps/electron/src/views/voice-turn/services/voiceTurnService.ts) deve resolver o caminho de execução a partir de:

- `settings.ttsPlaybackMode`
- capacidades TTS fornecidas pelo backend

Regras:

- `standard` -> mantém o fluxo atual de resposta com `audioBase64`
- `stream` com suporte -> usa WebSocket TTS streaming
- `stream` sem suporte -> fallback explícito para `standard` com aviso/log controlado, ou bloqueio preventivo na UI

Como decisão de produto desta fase, a UI deve bloquear a escolha inválida antes de chegar ao fluxo de execução.

## Backend API

### Public capability source

A API precisa expor capacidades do TTS ativo em endpoint consumível pelo frontend. O caminho recomendado é ampliar o módulo já relacionado ao TTS ativo, evitando endpoint paralelo desnecessário.

Opções aceitáveis:

- estender o payload de `/api/v1/setup/status`
- ou expor `/api/v1/tts/capabilities`

Recomendação: criar `/api/v1/tts/capabilities` para manter responsabilidade focada e payload pequeno.

### Capability resolution

A API será a fonte da verdade para o frontend. Ela resolve:

- provider TTS ativo
- modos suportados
- se o streaming é real ou experimental

Payload sugerido:

```ts
type TTSCapabilitiesResponse = {
  provider: string;
  playbackModes: {
    standard: {
      supported: boolean;
      recommended: boolean;
    };
    stream: {
      supported: boolean;
      recommended: boolean;
      experimental: boolean;
      kind: 'realtime' | 'post_synthesis_chunked' | 'unsupported';
    };
  };
};
```

## TTS Server / Provider Layer

### Piper behavior

Para Piper nesta fase:

- `supportsStandardSynthesis = true`
- `supportsRealtimeStreaming = false`
- `supportsChunkedPostSynthesis = true` somente se decidirmos expor a trilha WebSocket já criada como modo experimental ao usuário

Isso significa:

- `standard` é o modo recomendado
- `stream` pode existir como modo experimental de entrega, mas não deve prometer menor latência real

### Future providers

Providers futuros como Kokoro ou outro runtime incremental poderão retornar:

- `supportsStandardSynthesis = true`
- `supportsRealtimeStreaming = true`
- `supportsChunkedPostSynthesis = false`

Nesse cenário, `stream` pode virar modo recomendado.

## Behavior Rules

### Mode resolution

Modo efetivo = interseção entre:

- preferência global do usuário
- capacidades do provider ativo

### Fallback rules

Nesta fase, a decisão mais segura é:

- a UI não deve deixar o usuário selecionar um modo realmente não suportado
- se houver mismatch raro por troca de provider/config em runtime, o backend ou frontend deve falhar explicitamente e registrar motivo claro

### Provider switches

Quando a voz/provider TTS ativo mudar:

- o frontend deve recarregar capacidades
- a UI deve atualizar opções/recomendação
- se o modo salvo ficar inválido, o sistema deve:
  - ajustar temporariamente para `standard`, ou
  - persistir de volta `standard`

Recomendação desta fase: persistir de volta `standard` para evitar estado visual mentiroso.

## Error Handling

- Capabilities indisponíveis: UI assume `standard` temporariamente e mostra estado conservador
- Provider ativo sem voz válida: capabilities retornam erro claro ou `unsupported`
- Playback mode salvo inválido: normalizar para `standard`
- Tentativa de stream com provider incompatível: erro explícito, sem fallback silencioso invisível

## Testing Strategy

### Frontend

- teste da tipagem/default em `app-settings`
- teste de normalização e persistência em `appSettingsService`
- teste da lógica de opções/disabled state em `AppSettingsModal`
- teste da resolução de modo em `voiceTurnService`

### API

- teste do endpoint de capabilities
- teste de mapeamento Piper -> `standard supported`, `stream experimental/unsupported`
- teste de normalização quando provider ativo muda

### Integration

- com `ttsPlaybackMode = standard`, voice turn usa o fluxo atual
- com `ttsPlaybackMode = stream` e provider suportado, usa WebSocket
- com provider que não suporta `stream`, a UI não permite seleção inválida

## Rollout

### Phase 1

- adicionar preferência global
- publicar capabilities do backend
- refletir capabilities na UI
- integrar `voiceTurnService` para alternar entre `standard` e `stream`

### Phase 2

- adicionar override por voz no `SettingsModal.vue`

### Phase 3

- suportar providers com streaming incremental real

## Open Decisions Resolved

- O modo não será modelado como provider
- A preferência será global nesta fase
- Piper permanece recomendado em `standard`
- `stream` em provider sem streaming real será tratado como experimental ou indisponível conforme capability publicada
