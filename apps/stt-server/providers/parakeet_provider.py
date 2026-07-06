import json
import time
from pathlib import Path

from core.types import (
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)
from providers.base import STTProvider
from services.audio_loader import load_wav_audio, resample_audio


class ParakeetProvider(STTProvider):
    provider_name = 'parakeet'

    def supports_streaming(self) -> bool:
        return False

    def _import_runtime(self):
        missing_dependencies: list[str] = []

        try:
            import torch  # type: ignore
        except ModuleNotFoundError:
            torch = None
            missing_dependencies.append('torch')

        try:
            from transformers import AutoConfig, AutoProcessor  # type: ignore
            from transformers.models.parakeet.generation_parakeet import (  # type: ignore
                ParakeetRNNTDecoderCache,
            )
            from transformers.models.parakeet.modeling_parakeet import (  # type: ignore
                ParakeetEncoderModelOutput,
                ParakeetForCTC,
                ParakeetForRNNT,
                ParakeetForTDT,
            )
        except ModuleNotFoundError:
            AutoConfig = None
            AutoProcessor = None
            ParakeetForCTC = None
            ParakeetEncoderModelOutput = None
            ParakeetForRNNT = None
            ParakeetRNNTDecoderCache = None
            ParakeetForTDT = None
            missing_dependencies.append('transformers')

        try:
            import librosa  # type: ignore  # noqa: F401
        except ModuleNotFoundError:
            missing_dependencies.append('librosa')

        if missing_dependencies:
            raise RuntimeError(
                'Parakeet STT provider dependencies are not installed. '
                'Install '
                + ', '.join(missing_dependencies)
                + ' in apps/stt-server/.venv before using this provider.'
            )

        return (
            torch,
            AutoConfig,
            AutoProcessor,
            ParakeetForCTC,
            ParakeetEncoderModelOutput,
            ParakeetForRNNT,
            ParakeetRNNTDecoderCache,
            ParakeetForTDT,
        )

    def _read_config(self, config_path: Path):
        try:
            return json.loads(config_path.read_text(encoding='utf-8'))
        except Exception:
            return None

    def _is_parakeet_config(self, config_payload, hints: list[str]) -> bool:
        config_hints: list[str] = []

        if isinstance(config_payload, dict):
            model_type = config_payload.get('model_type')
            if isinstance(model_type, str):
                config_hints.append(model_type)

            name_or_path = config_payload.get('_name_or_path')
            if isinstance(name_or_path, str):
                config_hints.append(name_or_path)

            architectures = config_payload.get('architectures')
            if isinstance(architectures, list):
                config_hints.extend(
                    item for item in architectures if isinstance(item, str)
                )

        return 'parakeet' in ' '.join([*hints, *config_hints]).lower()

    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        model_path = config.model_path.strip()

        if not model_path:
            return ValidationResult(valid=False, reason='Model path is empty')

        path_candidate = Path(model_path)

        if path_candidate.exists():
            model_directory = (
                path_candidate if path_candidate.is_dir() else path_candidate.parent
            )
            selected_file_name = (
                path_candidate.name.lower() if path_candidate.is_file() else None
            )

            config_path = model_directory / 'config.json'
            if not config_path.exists():
                return ValidationResult(
                    valid=False,
                    reason='Parakeet model folder is missing config.json',
                )

            weight_files = [
                entry.name.lower()
                for entry in model_directory.iterdir()
                if entry.is_file()
                and (
                    entry.name.lower().endswith('.safetensors')
                    or entry.name.lower() == 'pytorch_model.bin'
                    or entry.name.lower() == 'model.bin'
                )
            ]

            if not weight_files:
                return ValidationResult(
                    valid=False,
                    reason='Parakeet model folder is missing a supported weight file',
                )

            if selected_file_name and selected_file_name not in weight_files:
                return ValidationResult(
                    valid=False,
                    reason='Selected file is not a supported Parakeet weight file',
                )

            processor_artifacts = [
                'preprocessor_config.json',
                'processor_config.json',
                'tokenizer.json',
                'tokenizer_config.json',
                'vocab.json',
                'merges.txt',
                'special_tokens_map.json',
            ]

            if not any((model_directory / artifact).exists() for artifact in processor_artifacts):
                return ValidationResult(
                    valid=False,
                    reason='Parakeet model folder is missing processor or tokenizer files',
                )

            config_payload = self._read_config(config_path)
            if not self._is_parakeet_config(
                config_payload,
                [model_path, str(model_directory)],
            ):
                return ValidationResult(
                    valid=False,
                    reason='Selected bundle is not recognized as a Parakeet model',
                )

            return ValidationResult(
                valid=True,
                normalized_model_path=str(model_directory),
            )

        if 'parakeet' not in model_path.lower():
            return ValidationResult(
                valid=False,
                reason='Only Parakeet-compatible Hugging Face repositories are supported',
            )

        return ValidationResult(valid=True, normalized_model_path=model_path)

    def _resolve_model_class(self, model_type: str, model_classes: tuple):
        _ParakeetForCTC, _ParakeetForRNNT, _ParakeetForTDT = model_classes

        if model_type == 'parakeet_ctc':
            return _ParakeetForCTC

        if model_type == 'parakeet_rnnt':
            return _ParakeetForRNNT

        if model_type == 'parakeet_tdt':
            return _ParakeetForTDT

        raise RuntimeError(f'Unsupported Parakeet model_type: {model_type}')

    def _normalize_decoded_text(self, value) -> str:
        if isinstance(value, list):
            value = value[0] if value else ''

        text = str(value).replace('<blank>', '').strip()
        return text

    def load_model(self, config: ProviderModelConfig):
        (
            torch,
            AutoConfig,
            AutoProcessor,
            ParakeetForCTC,
            ParakeetEncoderModelOutput,
            ParakeetForRNNT,
            ParakeetRNNTDecoderCache,
            ParakeetForTDT,
        ) = self._import_runtime()
        device = 'cuda' if config.device == 'cuda' and torch.cuda.is_available() else 'cpu'
        model_config = AutoConfig.from_pretrained(config.model_path)
        processor = AutoProcessor.from_pretrained(config.model_path)
        model_class = self._resolve_model_class(
            model_config.model_type,
            (ParakeetForCTC, ParakeetForRNNT, ParakeetForTDT),
        )
        model = model_class.from_pretrained(config.model_path)
        model.to(device)
        model.eval()

        blank_token_id = getattr(model.config, 'blank_token_id', None)
        if getattr(model.config, 'is_encoder_decoder', False):
          if blank_token_id is None:
              blank_token_id = getattr(processor, 'blank_token_id', None)

          if blank_token_id is not None:
              model.config.decoder_start_token_id = blank_token_id
              model.generation_config.decoder_start_token_id = blank_token_id

          pad_token_id = getattr(model.config, 'pad_token_id', None)
          if pad_token_id is None:
              pad_token_id = getattr(processor.tokenizer, 'pad_token_id', None)
              model.config.pad_token_id = pad_token_id

          if pad_token_id is not None:
              model.generation_config.pad_token_id = pad_token_id

        return {
            'torch': torch,
            'processor': processor,
            'model': model,
            'device': device,
            'model_type': model_config.model_type,
            'ParakeetEncoderModelOutput': ParakeetEncoderModelOutput,
            'ParakeetRNNTDecoderCache': ParakeetRNNTDecoderCache,
        }

    def _transcribe_transducer(self, loaded_model, inputs) -> str:
        torch = loaded_model['torch']
        model = loaded_model['model']
        processor = loaded_model['processor']
        model_type = loaded_model['model_type']
        encoder_output_class = loaded_model['ParakeetEncoderModelOutput']
        decoder_cache_class = loaded_model['ParakeetRNNTDecoderCache']

        encoder_outputs = model.get_audio_features(
            input_features=inputs['input_features'],
            attention_mask=inputs.get('attention_mask'),
            output_attention_mask=True,
        )

        if encoder_outputs.attention_mask is not None:
            encoder_valid_length = int(encoder_outputs.attention_mask.sum(-1)[0].item())
        else:
            encoder_valid_length = int(encoder_outputs.pooler_output.shape[1])

        current_frame_idx = 0
        decoder_cache = decoder_cache_class(model.config)
        current_token = torch.tensor(
            [[model.config.blank_token_id]],
            dtype=torch.long,
            device=model.device,
        )
        sequence_tokens = [int(model.config.blank_token_id)]
        step_durations = [0]
        symbols_at_frame = 0
        max_steps = max(1, encoder_valid_length * max(1, int(model.config.max_symbols_per_step)))

        for _ in range(max_steps):
            if current_frame_idx >= encoder_valid_length:
                break

            current_encoder_output = encoder_output_class(
                pooler_output=encoder_outputs.pooler_output[:, current_frame_idx, None, :],
            )

            outputs = model(
                decoder_input_ids=current_token,
                decoder_cache=decoder_cache,
                use_decoder_cache=True,
                encoder_outputs=current_encoder_output,
            )
            logits = outputs.logits[:, -1, :]

            if model_type == 'parakeet_tdt':
                token = int(logits[:, : model.config.vocab_size].argmax(dim=-1)[0].item())
                duration = int(logits[:, model.config.vocab_size :].argmax(dim=-1)[0].item())
                if token == model.config.blank_token_id and duration == 0:
                    duration = 1
                current_frame_idx += duration
            else:
                token = int(logits.argmax(dim=-1)[0].item())
                if token == model.config.blank_token_id:
                    current_frame_idx += 1
                    symbols_at_frame = 0
                else:
                    symbols_at_frame += 1
                    if symbols_at_frame >= int(model.config.max_symbols_per_step):
                        current_frame_idx += 1
                        symbols_at_frame = 0
                duration = 1

            sequence_tokens.append(token)
            step_durations.append(duration)
            current_token = torch.tensor([[token]], dtype=torch.long, device=model.device)

        decoded = processor.decode(
            torch.tensor(sequence_tokens, dtype=torch.long, device=model.device).unsqueeze(0),
            durations=torch.tensor(step_durations, dtype=torch.long, device=model.device).unsqueeze(0),
        )

        if isinstance(decoded, tuple):
            return self._normalize_decoded_text(decoded[0])

        return self._normalize_decoded_text(decoded)

    def transcribe(self, loaded_model, request: TranscriptionRequest) -> TranscriptionResult:
        started_at = time.perf_counter()
        audio, sample_rate = load_wav_audio(request.audio_path)
        processor = loaded_model['processor']
        model = loaded_model['model']
        torch = loaded_model['torch']
        model_type = loaded_model['model_type']
        target_sample_rate = int(
            getattr(processor.feature_extractor, 'sampling_rate', sample_rate)
        )

        if sample_rate != target_sample_rate:
            audio = resample_audio(audio, sample_rate, target_sample_rate)
            sample_rate = target_sample_rate

        inputs = processor(
            audio,
            sampling_rate=sample_rate,
            return_tensors='pt',
        )
        inputs = {
            key: value.to(model.device)
            for key, value in inputs.items()
        }

        with torch.no_grad():
            if model_type == 'parakeet_ctc':
                outputs = model(**inputs)
                predicted_ids = outputs.logits.argmax(dim=-1)
                text = processor.batch_decode(predicted_ids)[0].strip()
            else:
                text = self._transcribe_transducer(loaded_model, inputs)

        duration_ms = round((time.perf_counter() - started_at) * 1000)

        return TranscriptionResult(
            text=text,
            language=request.config.language,
            language_probability=None,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )
