import os
import re
import time
import threading
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


APP_NAME = "scrolith-translation-runtime"
APP_VERSION = "0.1.0"

DEFAULT_FASTTEXT_URL = "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin"
SUPPORTED_LANGUAGE_LABELS = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "tl": "Tagalog",
    "ha": "Hausa",
    "sw": "Swahili",
    "zh": "Chinese",
    "ar": "Arabic",
}

M2M100_LANGUAGE_ALIASES = {
    "en": "en",
    "en-us": "en",
    "en-gb": "en",
    "es": "es",
    "es-es": "es",
    "es-mx": "es",
    "fr": "fr",
    "fr-fr": "fr",
    "fr-ca": "fr",
    "tl": "tl",
    "fil": "tl",
    "ha": "ha",
    "sw": "sw",
    "zh": "zh",
    "zh-cn": "zh",
    "zh-tw": "zh",
    "cmn": "zh",
    "ar": "ar",
    "ar-sa": "ar",
}


def env_flag(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on", "enabled"}


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(minimum, min(maximum, value))


def normalize_locale(value: Any, fallback: str = "en") -> str:
    normalized = str(value or "").strip().lower().replace("_", "-")
    return normalized or fallback


def to_model_locale(value: str) -> str:
    normalized = normalize_locale(value)
    return M2M100_LANGUAGE_ALIASES.get(normalized, normalized.split("-")[0])


def heuristic_detect(text: str) -> Dict[str, Any]:
    normalized = str(text or "").lower()
    if re.search(r"[\u0600-\u06ff]", normalized):
        return {"language": "ar", "confidence": 0.60}
    if re.search(r"[\u4e00-\u9fff]", normalized):
        return {"language": "zh", "confidence": 0.60}
    if re.search(r"\b(hola|gracias|buenos|trabajo)\b", normalized):
        return {"language": "es", "confidence": 0.55}
    if re.search(r"\b(bonjour|merci|salut|travail)\b", normalized):
        return {"language": "fr", "confidence": 0.55}
    if re.search(r"\b(kumusta|salamat|po)\b", normalized):
        return {"language": "tl", "confidence": 0.55}
    if re.search(r"\b(sannu|na gode)\b", normalized):
        return {"language": "ha", "confidence": 0.55}
    if re.search(r"\b(salamu|habari|asante)\b", normalized):
        return {"language": "sw", "confidence": 0.55}
    return {"language": "en", "confidence": 0.50}


class RuntimeSettings(BaseModel):
    runtime_mode: str = Field(default_factory=lambda: os.getenv("TRANSLATION_RUNTIME_MODE", "m2m100"))
    model_name: str = Field(default_factory=lambda: os.getenv("TRANSLATION_MODEL_NAME", "facebook/m2m100_418M"))
    engine_key: str = Field(default_factory=lambda: os.getenv("TRANSLATION_ENGINE_KEY", "m2m100_418m"))
    detector_key: str = Field(default_factory=lambda: os.getenv("TRANSLATION_DETECTOR_KEY", "fasttext_lid_176"))
    model_cache_dir: str = Field(default_factory=lambda: os.getenv("TRANSLATION_MODEL_CACHE_DIR", "/models/huggingface"))
    preload_models: bool = Field(default_factory=lambda: env_flag("TRANSLATION_PRELOAD_MODELS", True))
    auto_download_fasttext: bool = Field(default_factory=lambda: env_flag("TRANSLATION_AUTO_DOWNLOAD_FASTTEXT", True))
    max_chars: int = Field(default_factory=lambda: env_int("TRANSLATION_MAX_CHARS", 5000, 120, 20000))
    beam_size: int = Field(default_factory=lambda: env_int("TRANSLATION_BEAM_SIZE", 4, 1, 8))
    num_threads: int = Field(default_factory=lambda: env_int("TRANSLATION_NUM_THREADS", 2, 1, 16))
    max_new_tokens: int = Field(default_factory=lambda: env_int("TRANSLATION_MAX_NEW_TOKENS", 512, 32, 4096))
    fasttext_model_path: str = Field(default_factory=lambda: os.getenv("TRANSLATION_FASTTEXT_MODEL_PATH", "/models/fasttext/lid.176.bin"))
    fasttext_model_url: str = Field(default_factory=lambda: os.getenv("TRANSLATION_FASTTEXT_MODEL_URL", DEFAULT_FASTTEXT_URL))
    runtime_api_key: str = Field(default_factory=lambda: os.getenv("TRANSLATION_RUNTIME_API_KEY", ""))


class DetectRequest(BaseModel):
    text: str
    detector: Optional[str] = None
    allowedLocales: Optional[List[str]] = None


class TranslateRequest(BaseModel):
    text: str
    sourceLanguage: str
    targetLanguage: str
    model: Optional[str] = None


class RuntimeState:
    def __init__(self, settings: RuntimeSettings):
        self.settings = settings
        self._lock = threading.Lock()
        self._fasttext_model = None
        self._tokenizer = None
        self._model = None
        self._torch = None
        self._transformers = None
        self._load_error: Optional[str] = None

    def ensure_fasttext_model(self):
        if self._fasttext_model is not None:
            return self._fasttext_model
        with self._lock:
            if self._fasttext_model is not None:
                return self._fasttext_model
            path = Path(self.settings.fasttext_model_path)
            if not path.exists():
                if not self.settings.auto_download_fasttext:
                    return None
                path.parent.mkdir(parents=True, exist_ok=True)
                urllib.request.urlretrieve(self.settings.fasttext_model_url, path)
            import fasttext  # type: ignore

            self._fasttext_model = fasttext.load_model(str(path))
            return self._fasttext_model

    def ensure_translation_model(self):
        if self.settings.runtime_mode == "mock":
            return None, None
        if self._tokenizer is not None and self._model is not None:
            return self._tokenizer, self._model
        with self._lock:
            if self._tokenizer is not None and self._model is not None:
                return self._tokenizer, self._model
            try:
                import torch  # type: ignore
                from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer  # type: ignore

                cache_dir = Path(self.settings.model_cache_dir)
                cache_dir.mkdir(parents=True, exist_ok=True)
                torch.set_num_threads(self.settings.num_threads)
                tokenizer = M2M100Tokenizer.from_pretrained(self.settings.model_name, cache_dir=str(cache_dir))
                model = M2M100ForConditionalGeneration.from_pretrained(
                    self.settings.model_name,
                    cache_dir=str(cache_dir),
                    low_cpu_mem_usage=True
                )
                model.eval()
                self._torch = torch
                self._transformers = True
                self._tokenizer = tokenizer
                self._model = model
                self._load_error = None
            except Exception as error:
                self._load_error = str(error)
                raise
            return self._tokenizer, self._model

    def health(self) -> Dict[str, Any]:
        return {
            "service": APP_NAME,
            "version": APP_VERSION,
            "runtimeMode": self.settings.runtime_mode,
            "engineKey": self.settings.engine_key,
            "detectorKey": self.settings.detector_key,
            "modelName": self.settings.model_name,
            "modelLoaded": self._model is not None or self.settings.runtime_mode == "mock",
            "fasttextLoaded": self._fasttext_model is not None,
            "loadError": self._load_error,
        }


@lru_cache(maxsize=1)
def get_settings() -> RuntimeSettings:
    return RuntimeSettings()


@lru_cache(maxsize=1)
def get_state() -> RuntimeState:
    state = RuntimeState(get_settings())
    if state.settings.preload_models:
        try:
            state.ensure_fasttext_model()
        except Exception:
            pass
        if state.settings.runtime_mode != "mock":
            try:
                state.ensure_translation_model()
            except Exception:
                pass
    return state


def detect_language(text: str, allowed_locales: Optional[List[str]] = None) -> Dict[str, Any]:
    state = get_state()
    allowed = [to_model_locale(item) for item in (allowed_locales or []) if str(item or "").strip()]
    start = time.perf_counter()
    result = None

    try:
        model = state.ensure_fasttext_model()
        if model is not None:
            labels, scores = model.predict(text.replace("\n", " "), k=max(1, len(allowed) or 5))
            for label, score in zip(labels, scores):
                locale = str(label).replace("__label__", "").strip().lower()
                if allowed and locale not in allowed:
                    continue
                result = {
                    "language": locale,
                    "confidence": float(score),
                    "detectorKey": state.settings.detector_key,
                }
                break
    except Exception:
        result = None

    if result is None:
        heuristic = heuristic_detect(text)
        locale = to_model_locale(heuristic["language"])
        if allowed and locale not in allowed:
            locale = allowed[0]
        result = {
            "language": locale,
            "confidence": heuristic["confidence"],
            "detectorKey": state.settings.detector_key,
        }

    result["metadata"] = {
        "latencyMs": int((time.perf_counter() - start) * 1000),
        "runtimeMode": state.settings.runtime_mode,
    }
    return result


def translate_text(text: str, source_language: str, target_language: str) -> Dict[str, Any]:
    state = get_state()
    source = to_model_locale(source_language)
    target = to_model_locale(target_language)
    started = time.perf_counter()

    if source == target:
        return {
            "translatedText": text,
            "engineKey": state.settings.engine_key,
            "modelVersion": state.settings.model_name,
            "metadata": {"latencyMs": 0, "runtimeMode": state.settings.runtime_mode},
        }

    if state.settings.runtime_mode == "mock":
        return {
            "translatedText": f"[{source}->{target}] {text}",
            "engineKey": state.settings.engine_key,
            "modelVersion": "mock-v1",
            "metadata": {"latencyMs": 0, "runtimeMode": "mock"},
        }

    try:
        tokenizer, model = state.ensure_translation_model()
        tokenizer.src_lang = source
        encoded = tokenizer(text[: state.settings.max_chars], return_tensors="pt")
        generated_tokens = model.generate(
            **encoded,
            forced_bos_token_id=tokenizer.get_lang_id(target),
            num_beams=state.settings.beam_size,
            max_new_tokens=state.settings.max_new_tokens,
        )
        translated = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        return {
            "translatedText": translated,
            "engineKey": state.settings.engine_key,
            "modelVersion": state.settings.model_name,
            "metadata": {
                "latencyMs": int((time.perf_counter() - started) * 1000),
                "runtimeMode": state.settings.runtime_mode,
                "sourceLanguage": source,
                "targetLanguage": target,
            },
        }
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Translation runtime unavailable: {error}") from error


app = FastAPI(title=APP_NAME, version=APP_VERSION)


def require_runtime_auth(authorization: Optional[str]) -> None:
    expected = str(get_settings().runtime_api_key or "").strip()
    if not expected:
        return
    header = str(authorization or "").strip()
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    token = header[7:].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid bearer token.")


@app.get("/health")
def health():
    return {"success": True, "data": get_state().health()}


@app.get("/languages")
def languages():
    items = [
        {"code": code, "name": name, "modelCode": to_model_locale(code)}
        for code, name in sorted(SUPPORTED_LANGUAGE_LABELS.items())
    ]
    return {"success": True, "data": {"items": items}}


@app.post("/detect")
def detect(request: DetectRequest, authorization: Optional[str] = Header(default=None)):
    require_runtime_auth(authorization)
    text = str(request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    result = detect_language(text[: get_settings().max_chars], request.allowedLocales)
    return {"success": True, "data": result}


@app.post("/translate")
def translate(request: TranslateRequest, authorization: Optional[str] = Header(default=None)):
    require_runtime_auth(authorization)
    text = str(request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    source = to_model_locale(request.sourceLanguage)
    target = to_model_locale(request.targetLanguage)
    if source == target:
        return {
            "success": True,
            "data": {
                "translatedText": text,
                "engineKey": get_settings().engine_key,
                "modelVersion": get_settings().model_name,
                "metadata": {"latencyMs": 0, "runtimeMode": get_settings().runtime_mode},
            },
        }
    payload = translate_text(text, source, target)
    return {"success": True, "data": payload}
