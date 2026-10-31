"""Provider-agnostic LLM client (OpenAI, OpenRouter, Anthropic, Gemini) over plain HTTP.

Every caller must handle `LLMUnavailable` and fall back to a heuristic,
so the whole pipeline still works without an API key.
"""
import json
import re

import httpx

from ..config import settings

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "openrouter": "openai/gpt-4o-mini",
    "anthropic": "claude-sonnet-5-5",
    "gemini": "gemini-3.5-flash-lite",
}


class LLMUnavailable(Exception):
    pass


def is_enabled() -> bool:
    return settings.llm_enabled


def _model() -> str:
    return settings.LLM_MODEL or DEFAULT_MODELS.get(settings.LLM_PROVIDER, "")


def _models() -> list[str]:
    """Primary model followed by LLM_FALLBACK_MODELS, without duplicates."""
    return list(dict.fromkeys([_model()] + settings.LLM_FALLBACK_MODELS))


def _complete(system: str, prompt: str, max_tokens: int, model: str) -> str:
    provider = settings.LLM_PROVIDER
    key = settings.LLM_API_KEY
    timeout = httpx.Timeout(90.0)

    if provider in ("openai", "openrouter"):
        base = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
        r = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=timeout,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    if provider == "anthropic":
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            json={
                "model": model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=timeout,
        )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json()["content"])

    if provider == "gemini":
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    "responseMimeType": "application/json",
                },
            },
            timeout=timeout,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

    raise LLMUnavailable(f"Unsupported LLM_PROVIDER '{provider}'")


def _parse_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in LLM response")
    return json.loads(text[start:end + 1])


def complete_json(system: str, prompt: str, max_tokens: int = 1500) -> dict:
    """Ask the LLM for a JSON object. Raises LLMUnavailable on any failure."""
    if not is_enabled():
        raise LLMUnavailable("No LLM_API_KEY configured")
    system += "\nRespond with a single valid JSON object only."
    errors = []
    for model in _models():
        try:
            return _parse_json(_complete(system, prompt, max_tokens, model))
        except LLMUnavailable:
            raise
        except httpx.HTTPStatusError as e:
            # Overloaded / rate-limited / retired model -> try the next one
            errors.append(f"{model}: HTTP {e.response.status_code}")
            if e.response.status_code in (401, 403):
                break
        except Exception as e:  # network, timeout, malformed JSON
            errors.append(f"{model}: {type(e).__name__}: {e}")
    raise LLMUnavailable("LLM call failed: " + "; ".join(errors))


def status() -> dict:
    return {
        "enabled": is_enabled(),
        "provider": settings.LLM_PROVIDER if is_enabled() else None,
        "model": _model() if is_enabled() else None,
    }
