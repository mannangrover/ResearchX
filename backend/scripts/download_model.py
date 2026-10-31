"""Download the Sentence Transformers model into backend/models/ (≈90 MB, one time).

Run from backend/:  python -m scripts.download_model

A local copy avoids Hugging Face download issues and lets the demo run offline.
"""
from pathlib import Path

import httpx

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
FILES = [
    "config.json", "config_sentence_transformers.json", "model.safetensors", "modules.json",
    "sentence_bert_config.json", "tokenizer_config.json", "tokenizer.json", "vocab.txt",
    "special_tokens_map.json", "1_Pooling/config.json",
]
DEST = Path(__file__).resolve().parent.parent / "models" / "all-MiniLM-L6-v2"


def main():
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        for name in FILES:
            target = DEST / name
            if target.exists() and target.stat().st_size > 0:
                print(f"  ok      {name}")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            r = client.get(f"https://huggingface.co/{MODEL}/resolve/main/{name}")
            r.raise_for_status()
            target.write_bytes(r.content)
            print(f"  fetched {name} ({len(r.content) // 1024} KB)")
    print(f"Model ready in {DEST}")


if __name__ == "__main__":
    main()
