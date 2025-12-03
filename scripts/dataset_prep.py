#!/usr/bin/env python
import argparse
import json
import logging
import os
import random
import sys
from dataclasses import dataclass
from hashlib import sha1
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from datasets import load_dataset, Dataset  # type: ignore


# ----------------- Logging ----------------- #

LOGGER = logging.getLogger("dataset_prep")


def setup_logging(verbosity: int = 1) -> None:
    level = logging.INFO if verbosity <= 1 else logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


# ----------------- Config structures ----------------- #

@dataclass
class DatasetEntry:
    """Description of a single dataset in dataset_metadata.json."""
    name: str
    hf_name: str
    subset: Optional[str]
    split: str
    prompt_field: str
    response_field: str
    context_field: Optional[str]
    language: Optional[str]  # optional: can be None or like "en" / "fr" / "fr-CA"
    max_examples: Optional[int]

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DatasetEntry":
        # Keep this tolerant to small naming variations
        return cls(
            name=d.get("name") or d.get("id") or d["hf_name"],
            hf_name=d["hf_name"],
            subset=d.get("subset"),
            split=d.get("split", "train"),
            prompt_field=d.get("prompt_field", "prompt"),
            response_field=d.get("response_field", "response"),
            context_field=d.get("context_field"),
            language=d.get("language"),
            max_examples=d.get("max_examples"),
        )


@dataclass
class PrepConfig:
    output_dir: Path
    langs: List[str]
    max_per_dataset: int
    metadata_file: Path
    cache_dir: Path
    seed: int


# ----------------- Dedup state ----------------- #

@dataclass
class DedupState:
    """Simple exact-dedup by hash of prompt+response."""
    seen_hashes: Set[str]

    @classmethod
    def load(cls, path: Path) -> "DedupState":
        if not path.exists():
            LOGGER.info("No dedup state found at %s, starting fresh.", path)
            return cls(seen_hashes=set())
        try:
            with path.open("r", encoding="utf-8") as f:
                hashes = json.load(f)
            if not isinstance(hashes, list):
                raise ValueError("dedup state not a list")
            LOGGER.info("Loaded dedup state from %s (%d entries).", path, len(hashes))
            return cls(seen_hashes=set(hashes))
        except Exception as e:
            LOGGER.warning(
                "Failed to load dedup state from %s (%s). Starting fresh.",
                path,
                e,
            )
            return cls(seen_hashes=set())

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(sorted(self.seen_hashes), f)
        LOGGER.info("Saved dedup state to %s (%d entries).", path, len(self.seen_hashes))

    def is_new(self, key: str) -> bool:
        if key in self.seen_hashes:
            return False
        self.seen_hashes.add(key)
        return True


# ----------------- Core processing ----------------- #

def load_metadata(path: Path) -> List[DatasetEntry]:
    if not path.exists():
        raise FileNotFoundError(f"metadata_file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "datasets" in data:
        raw_list = data["datasets"]
    elif isinstance(data, list):
        raw_list = data
    else:
        raise ValueError("dataset_metadata.json must be a list or have a 'datasets' list")

    entries = [DatasetEntry.from_dict(d) for d in raw_list]
    LOGGER.info("Loaded %d dataset entries from %s", len(entries), path)
    return entries


def iter_examples_for_entry(
    entry: DatasetEntry,
    cfg: PrepConfig,
) -> Iterable[Dict[str, Any]]:
    """Yield canonicalized examples for a single dataset."""
    LOGGER.info(
        "Loading dataset %s (hf_name=%s, subset=%s, split=%s)",
        entry.name,
        entry.hf_name,
        entry.subset,
        entry.split,
    )

    ds_kwargs: Dict[str, Any] = {
        "path": entry.hf_name,
        "split": entry.split,
        "cache_dir": str(cfg.cache_dir),
    }
    if entry.subset:
        ds_kwargs["name"] = entry.subset

    ds: Dataset = load_dataset(**ds_kwargs)  # type: ignore

    LOGGER.info("Loaded dataset %s with %d rows", entry.name, len(ds))

    # Subsample if needed
    max_examples = entry.max_examples or cfg.max_per_dataset
    if max_examples and len(ds) > max_examples:
        LOGGER.info("Subsampling %d → %d examples for %s", len(ds), max_examples, entry.name)
        # deterministic shuffle
        indices = list(range(len(ds)))
        random.shuffle(indices)
        ds = ds.select(indices[:max_examples])

    # Iterate and normalize
    for ex in ds:
        try:
            prompt = str(ex[entry.prompt_field]).strip()
            response = str(ex[entry.response_field]).strip()
        except KeyError as e:
            LOGGER.warning(
                "Skipping example from %s due to missing field %s",
                entry.name,
                e,
            )
            continue

        if not prompt or not response:
            continue

        context: Optional[str] = None
        if entry.context_field:
            c_val = ex.get(entry.context_field)
            if c_val is not None:
                context = str(c_val).strip() or None

        # Language: either from metadata or fall back to "unknown"
        lang = entry.language or "unknown"

        # Filter on cfg.langs if applicable
        if cfg.langs and lang not in cfg.langs and lang != "unknown":
            continue

        canonical = {
            "prompt": prompt,
            "response": response,
            "language": lang,
            "task": infer_task_from_name(entry.name),
            "context": context,
            "source": entry.name,
        }
        yield canonical


def infer_task_from_name(name: str) -> str:
    """Very simple heuristic to assign task labels based on dataset name."""
    lower = name.lower()
    if any(k in lower for k in ["dialog", "chat", "conversation"]):
        return "dialog"
    if any(k in lower for k in ["reason", "cot", "step"]):
        return "reasoning"
    if any(k in lower for k in ["retrieval", "qa", "q&a", "rag"]):
        return "retrieval"
    # default
    return "instruction"


def prepare_datasets(cfg: PrepConfig) -> None:
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    cfg.cache_dir.mkdir(parents=True, exist_ok=True)

    corpus_path = cfg.output_dir / "mongars_corpus.jsonl"
    dedup_state_path = cfg.output_dir / "dedup_state.json"

    dedup = DedupState.load(dedup_state_path)
    entries = load_metadata(cfg.metadata_file)

    total_seen = 0
    total_written = 0
    total_skipped_dup = 0

    with corpus_path.open("a", encoding="utf-8") as out_f:
        for entry in entries:
            LOGGER.info("Processing dataset: %s", entry.name)
            for canonical in iter_examples_for_entry(entry, cfg):
                total_seen += 1
                # exact dedup on prompt+response
                key = sha1(
                    (canonical["prompt"] + "\n\n" + canonical["response"]).encode("utf-8")
                ).hexdigest()
                if not dedup.is_new(key):
                    total_skipped_dup += 1
                    continue
                out_f.write(json.dumps(canonical, ensure_ascii=False) + "\n")
                total_written += 1

    dedup.save(dedup_state_path)

    LOGGER.info("==== DATASET PREP SUMMARY ====")
    LOGGER.info("Total raw examples seen: %d", total_seen)
    LOGGER.info("Total written (unique): %d", total_written)
    LOGGER.info("Total skipped as duplicates: %d", total_skipped_dup)
    LOGGER.info("Output corpus: %s", corpus_path)


# ----------------- CLI ----------------- #

def parse_args(argv: Optional[List[str]] = None) -> PrepConfig:
    parser = argparse.ArgumentParser(
        description="monGARS dataset preparation pipeline",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        required=True,
        help="Directory where the prepared corpus and dedup state are stored.",
    )
    parser.add_argument(
        "--langs",
        type=str,
        default="en,fr,fr-CA",
        help="Comma-separated list of language codes to keep.",
    )
    parser.add_argument(
        "--max_per_dataset",
        type=int,
        default=50000,
        help="Maximum number of examples per dataset (after filtering).",
    )
    parser.add_argument(
        "--metadata_file",
        type=str,
        required=True,
        help="Path to dataset_metadata.json describing HF datasets and field mappings.",
    )
    parser.add_argument(
        "--cache_dir",
        type=str,
        default="./hf_cache",
        help="Cache directory for Hugging Face datasets.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for shuffling / subsampling.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=1,
        help="Increase verbosity (-v, -vv).",
    )

    args = parser.parse_args(argv)

    random.seed(args.seed)

    langs = [s.strip() for s in args.langs.split(",") if s.strip()]

    cfg = PrepConfig(
        output_dir=Path(args.output_dir),
        langs=langs,
        max_per_dataset=args.max_per_dataset,
        metadata_file=Path(args.metadata_file),
        cache_dir=Path(args.cache_dir),
        seed=args.seed,
    )
    setup_logging(args.verbose)
    LOGGER.info("Config: %s", cfg)
    return cfg


def main(argv: Optional[List[str]] = None) -> int:
    try:
        cfg = parse_args(argv)
        prepare_datasets(cfg)
        return 0
    except Exception as e:
        LOGGER.exception("Dataset preparation failed: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
