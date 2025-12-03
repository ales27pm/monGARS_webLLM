#!/usr/bin/env python
"""
monGARS Model Factory Orchestrator

One CLI to rule the entire pipeline:

    raw HF datasets
        → canonical cleaned dataset
        → embedding / llm2vec model
        → Unsloth SFT per monGARS task
        → export + quantisation to GGUF
        → MLC-format export via mlc-llm

Usage examples:

    python mongars_factory_cli.py run-all
    python mongars_factory_cli.py run-datasets
    python mongars_factory_cli.py run-embeddings
    python mongars_factory_cli.py run-sft --task dialog
    python mongars_factory_cli.py run-export

Requires:
    - Python 3.10+
    - pip install typer pyyaml (or use JSON config)
"""

from __future__ import annotations

import importlib
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import typer

YAML_AVAILABLE = importlib.util.find_spec("yaml") is not None
if YAML_AVAILABLE:
    yaml = importlib.import_module("yaml")  # type: ignore

app = typer.Typer(help="monGARS Model Factory Orchestrator")

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class StageConfig:
    enabled: bool
    script: Path
    args: Dict[str, str]
    env: Dict[str, str]
    timeout_seconds: Optional[float]


@dataclass
class UnslothTaskConfig:
    name: str
    args: Dict[str, str]
    env: Dict[str, str]


@dataclass
class UnslothConfig:
    enabled: bool
    script: Path
    env: Dict[str, str]
    tasks: Dict[str, UnslothTaskConfig]


@dataclass
class FactoryConfig:
    project_root: Path
    python_bin: str
    model_profile: str
    datasets: Optional[StageConfig]
    embeddings: Optional[StageConfig]
    unsloth: Optional[UnslothConfig]
    export: Optional[StageConfig]
    mlc_export: Optional[StageConfig]
    global_env: Dict[str, str]
    run_logs_dir: Path


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _log_box(title: str) -> None:
    line = "=" * (len(title) + 10)
    typer.echo(f"\n{line}")
    typer.echo(f"==  {title}  ==")
    typer.echo(f"{line}\n")


def _log_info(msg: str) -> None:
    typer.echo(f"[INFO] {msg}")


def _log_warn(msg: str) -> None:
    typer.echo(typer.style(f"[WARN] {msg}", fg=typer.colors.YELLOW))


def _log_error(msg: str) -> None:
    typer.echo(typer.style(f"[ERROR] {msg}", fg=typer.colors.RED), err=True)


def _log_summary_table(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    name_width = max(len("Stage"), *(len(str(r.get("name", ""))) for r in rows))
    status_width = max(len("Status"), *(len(str(r.get("status", ""))) for r in rows))
    time_width = len("Time (s)")

    header = f"{'Stage'.ljust(name_width)}  {'Status'.ljust(status_width)}  {'Time (s)'.ljust(time_width)}  Note"
    typer.echo(header)
    typer.echo("-" * len(header))
    for row in rows:
        elapsed = row.get("elapsed")
        time_str = f"{float(elapsed):.1f}" if isinstance(elapsed, (float, int)) else "-"
        note = str(row.get("note", "")).strip()
        typer.echo(
            f"{str(row.get('name', ''))[:name_width].ljust(name_width)}  "
            f"{str(row.get('status', '')).ljust(status_width)}  "
            f"{time_str.ljust(time_width)}  "
            f"{note}"
        )


def _ensure_script_exists(script: Path) -> None:
    if not script.exists():
        _log_error(f"Script not found: {script}")
        raise FileNotFoundError(f"Script not found: {script}")


def _dict_to_cli_args(args: Dict[str, str]) -> list[str]:
    """
    Convert {"output_dir": "./data", "langs": "en,fr"} to:
        ["--output_dir", "./data", "--langs", "en,fr"]
    """
    cli: list[str] = []
    for key, value in args.items():
        flag = f"--{key.replace('_', '-')}"
        cli.extend([flag, str(value)])
    return cli


def _load_config(config_path: Path) -> Dict[str, Any]:
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    text = config_path.read_text(encoding="utf-8")
    suffix = config_path.suffix.lower()

    if suffix in {".yml", ".yaml"}:
        if not YAML_AVAILABLE:
            raise RuntimeError(
                "PyYAML is required for YAML configs. Install it or provide JSON."
            )
        obj = yaml.safe_load(text)
    else:
        # Fallback to JSON regardless of YAML availability
        try:
            obj = json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Failed to parse config file {config_path}. "
                "Install PyYAML and use YAML, or provide valid JSON."
            ) from e

    if not isinstance(obj, dict):
        raise RuntimeError(
            f"Config file {config_path} must have a mapping at the top level, "
            f"got {type(obj).__name__} instead."
        )
    return obj


def _parse_stage_config(
    raw: Dict[str, Any] | None,
    project_root: Path,
) -> Optional[StageConfig]:
    if raw is None:
        return None

    enabled = bool(raw.get("enabled", True))
    script_raw = raw.get("script")
    if script_raw is None:
        _log_warn("Stage defined without 'script' key, disabling it.")
        return None

    script = (project_root / str(script_raw)).resolve()
    args_raw = raw.get("args", {}) or {}
    args = {str(k): str(v) for k, v in args_raw.items()}
    env_raw = raw.get("env", {}) or {}
    env = {str(k): str(v) for k, v in env_raw.items()}
    timeout_raw = raw.get("timeout_seconds")
    timeout_seconds = None
    if timeout_raw is not None:
        try:
            timeout_seconds = float(timeout_raw)
        except (TypeError, ValueError):
            _log_warn(
                f"Invalid timeout_seconds for stage at {script_raw}; ignoring value."
            )

    return StageConfig(
        enabled=enabled,
        script=script,
        args=args,
        env=env,
        timeout_seconds=timeout_seconds,
    )


def _parse_unsloth_config(
    raw: Dict[str, Any] | None,
    project_root: Path,
) -> Optional[UnslothConfig]:
    if raw is None:
        return None

    enabled = bool(raw.get("enabled", True))
    script_raw = raw.get("script")
    if script_raw is None:
        _log_warn("unsloth_sft section missing 'script', disabling.")
        return None

    script = (project_root / str(script_raw)).resolve()
    env_raw = raw.get("env", {}) or {}
    global_env = {str(k): str(v) for k, v in env_raw.items()}

    tasks_raw = raw.get("tasks", {}) or {}
    tasks: Dict[str, UnslothTaskConfig] = {}
    for name, task_cfg in tasks_raw.items():
        args_raw = task_cfg.get("args", {}) or {}
        args = {str(k): str(v) for k, v in args_raw.items()}
        task_env_raw = task_cfg.get("env", {}) or {}
        task_env = {str(k): str(v) for k, v in task_env_raw.items()}
        tasks[name] = UnslothTaskConfig(name=name, args=args, env=task_env)

    if not tasks:
        _log_warn("unsloth_sft has no tasks defined. It will be a no-op.")
    return UnslothConfig(enabled=enabled, script=script, env=global_env, tasks=tasks)


def _resolve_project_root(raw_root: str | Path) -> Path:
    project_root = Path(raw_root).resolve()
    if not project_root.exists():
        raise FileNotFoundError(f"project_root does not exist: {project_root}")
    return project_root


def _resolve_python_bin(raw_python_bin: str) -> str:
    if resolved := shutil.which(raw_python_bin):
        return resolved
    # If user provided an absolute path that is not executable, fail fast
    candidate = Path(raw_python_bin)
    if candidate.exists():
        raise FileNotFoundError(
            f"Configured python_bin is not executable or on PATH: {raw_python_bin}"
        )
    _log_warn(
        f"python_bin '{raw_python_bin}' not found on PATH; using current interpreter {sys.executable}."
    )
    return sys.executable


def load_factory_config(config_path: Path) -> FactoryConfig:
    raw = _load_config(config_path)

    project_root = _resolve_project_root(raw.get("project_root", "."))
    python_bin = _resolve_python_bin(str(raw.get("python_bin", sys.executable)))
    model_profile = str(raw.get("model_profile", "monGARS_webLLM")).strip()
    if not model_profile:
        raise ValueError("model_profile must be a non-empty string for targeted builds")
    run_logs_dir = (project_root / str(raw.get("run_logs_dir", "factory_runs"))).resolve()
    run_logs_dir.mkdir(parents=True, exist_ok=True)

    global_env_raw = raw.get("global_env", {}) or {}
    global_env = {str(k): str(v) for k, v in global_env_raw.items()}
    # Ensure all stages are explicitly targeted at the monGARS_webLLM build profile.
    global_env["MONGARS_MODEL_PROFILE"] = model_profile

    datasets = _parse_stage_config(raw.get("datasets"), project_root)
    embeddings = _parse_stage_config(raw.get("embeddings"), project_root)
    unsloth = _parse_unsloth_config(raw.get("unsloth_sft"), project_root)
    export = _parse_stage_config(raw.get("export"), project_root)
    mlc_export = _parse_stage_config(raw.get("mlc_export"), project_root)

    return FactoryConfig(
        project_root=project_root,
        python_bin=python_bin,
        model_profile=model_profile,
        datasets=datasets,
        embeddings=embeddings,
        unsloth=unsloth,
        export=export,
        mlc_export=mlc_export,
        global_env=global_env,
        run_logs_dir=run_logs_dir,
    )


def _build_env(
    global_env: Optional[Dict[str, str]] = None,
    extra: Optional[Dict[str, str]] = None,
    model_profile: Optional[str] = None,
) -> Dict[str, str]:
    merged = os.environ.copy()
    if global_env:
        merged |= global_env
    if extra:
        merged |= extra
    if model_profile:
        merged.setdefault("MONGARS_MODEL_PROFILE", model_profile)
    return merged


def _timestamp_slug() -> str:
    return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def _start_run_dir(base_dir: Path, label: str) -> Path:
    run_dir = base_dir / f"{label}_{_timestamp_slug()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def _write_run_summary(run_dir: Path, summary: Dict[str, Any]) -> None:
    summary_path = run_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


def _run_subprocess(
    command: list[str],
    env: Optional[Dict[str, str]] = None,
    cwd: Optional[Path] = None,
    dry_run: bool = False,
    timeout: Optional[float] = None,
    log_file: Optional[Path] = None,
) -> float:
    """
    Run a command with subprocess.run, streaming output, and return elapsed seconds.
    """
    if not isinstance(command, list) or not command:
        raise ValueError("command must be a non-empty list of arguments")

    cmd_str = " ".join(command)
    _log_info(f"Executing: {cmd_str}")

    if dry_run:
        _log_info("Dry-run enabled; command not executed.")
        return 0.0

    start = time.time()
    log_handle = log_file.open("a", encoding="utf-8") if log_file else None
    if log_handle:
        log_handle.write(
            f"# Command: {cmd_str}\n# Started: {datetime.utcnow().isoformat()}Z\n\n"
        )
    try:
        proc = subprocess.Popen(
            command,
            env=env,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=False,
        )

        assert proc.stdout is not None
        try:
            for line in proc.stdout:
                sys.stdout.write(line)
                if log_handle:
                    log_handle.write(line)
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            _log_error(
                f"Command exceeded timeout of {timeout} seconds and was terminated."
            )
            raise

        if proc.returncode != 0:
            _log_error(
                f"Command failed with exit code {proc.returncode}: {cmd_str}"
            )
            raise subprocess.CalledProcessError(proc.returncode, command)
    finally:
        if log_handle:
            log_handle.write(f"\n# Finished: {datetime.utcnow().isoformat()}Z\n")
            log_handle.flush()
            log_handle.close()
    end = time.time()
    elapsed = end - start
    _log_info(f"Stage finished in {elapsed:.1f} seconds.")
    return elapsed


# ---------------------------------------------------------------------------
# Stage runners
# ---------------------------------------------------------------------------


def run_stage(
    stage_name: str,
    cfg: StageConfig,
    python_bin: str,
    project_root: Path,
    global_env: Optional[Dict[str, str]] = None,
    model_profile: Optional[str] = None,
    run_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> float:
    if not cfg.enabled:
        _log_warn(f"Stage '{stage_name}' is disabled; skipping.")
        return 0.0

    _ensure_script_exists(cfg.script)
    _log_box(f"RUNNING STAGE: {stage_name}")

    command = [python_bin, str(cfg.script)]
    command.extend(_dict_to_cli_args(cfg.args))

    env = _build_env(
        global_env=global_env,
        extra=cfg.env,
        model_profile=model_profile,
    )
    log_file = run_dir.joinpath(f"{stage_name}.log") if run_dir else None
    return _run_subprocess(
        command,
        env=env,
        cwd=project_root,
        dry_run=dry_run,
        timeout=cfg.timeout_seconds,
        log_file=log_file,
    )


def run_unsloth_task(
    task_name: str,
    cfg: UnslothConfig,
    task_cfg: UnslothTaskConfig,
    python_bin: str,
    project_root: Path,
    global_env: Optional[Dict[str, str]] = None,
    model_profile: Optional[str] = None,
    run_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> float:
    if not cfg.enabled:
        _log_warn("Unsloth SFT is disabled; skipping all tasks.")
        return 0.0

    _ensure_script_exists(cfg.script)
    _log_box(f"RUNNING UNSLOTH TASK: {task_name}")

    base_args: Dict[str, str] = {}
    base_args |= task_cfg.args
    if "task" not in base_args:
        base_args["task"] = task_name

    command = [python_bin, str(cfg.script)]
    command.extend(_dict_to_cli_args(base_args))

    env = _build_env(
        global_env=global_env,
        extra={**cfg.env, **task_cfg.env},
        model_profile=model_profile,
    )
    log_file = run_dir.joinpath(f"unsloth_{task_name}.log") if run_dir else None
    return _run_subprocess(
        command,
        env=env,
        cwd=project_root,
        dry_run=dry_run,
        log_file=log_file,
    )


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------

CONFIG_OPTION = typer.Option(
    "monGARS_factory.yml",
    "--config",
    "-c",
    help="Path to the factory config file (YAML or JSON).",
)

DRY_RUN_OPTION = typer.Option(
    False,
    "--dry-run",
    help="Print commands without executing them.",
)


@app.command("preflight")
def cli_preflight(config: str = CONFIG_OPTION) -> None:
    """Validate configuration, scripts, and logging directories without running stages."""
    cfg = load_factory_config(Path(config))
    _log_box("PREFLIGHT CHECK")
    _log_info(f"Project root: {cfg.project_root}")
    _log_info(f"Python binary: {cfg.python_bin}")
    _log_info(f"Model profile: {cfg.model_profile}")
    _log_info(f"Run logs dir: {cfg.run_logs_dir}")

    rows: list[dict[str, Any]] = []

    def _stage_status(name: str, stage_cfg: Optional[StageConfig]) -> None:
        if stage_cfg is None:
            rows.append({"name": name, "status": "missing", "elapsed": "-", "note": "not configured"})
            return
        if not stage_cfg.enabled:
            rows.append({"name": name, "status": "disabled", "elapsed": "-", "note": "config"})
            return
        try:
            _ensure_script_exists(stage_cfg.script)
            rows.append(
                {
                    "name": name,
                    "status": "ready",
                    "elapsed": "-",
                    "note": f"script: {stage_cfg.script}",
                }
            )
        except FileNotFoundError:
            rows.append({"name": name, "status": "missing script", "elapsed": "-", "note": str(stage_cfg.script)})

    _stage_status("datasets", cfg.datasets)
    _stage_status("embeddings", cfg.embeddings)
    _stage_status("export", cfg.export)
    _stage_status("mlc_export", cfg.mlc_export)

    if cfg.unsloth is None:
        rows.append({"name": "unsloth", "status": "missing", "elapsed": "-", "note": "not configured"})
    elif not cfg.unsloth.enabled:
        rows.append({"name": "unsloth", "status": "disabled", "elapsed": "-", "note": "config"})
    else:
        try:
            _ensure_script_exists(cfg.unsloth.script)
            rows.append({"name": "unsloth", "status": "ready", "elapsed": "-", "note": str(cfg.unsloth.script)})
        except FileNotFoundError:
            rows.append({"name": "unsloth", "status": "missing script", "elapsed": "-", "note": str(cfg.unsloth.script)})

        for task_name, task_cfg in cfg.unsloth.tasks.items():
            task_note = f"task env keys: {', '.join(task_cfg.env.keys())}" if task_cfg.env else ""
            rows.append(
                {
                    "name": f"unsloth:{task_name}",
                    "status": "ready",
                    "elapsed": "-",
                    "note": task_note,
                }
            )

    _log_summary_table(rows)


@app.command("run-datasets")
def cli_run_datasets(
    config: str = CONFIG_OPTION,
    dry_run: bool = DRY_RUN_OPTION,
) -> None:
    """Run the dataset pipeline only."""
    cfg = load_factory_config(Path(config))
    if cfg.datasets is None:
        _log_error("No 'datasets' stage defined in config.")
        raise typer.Exit(code=1)

    run_dir = _start_run_dir(cfg.run_logs_dir, "datasets")
    started_at = f"{datetime.utcnow().isoformat()}Z"
    elapsed = run_stage(
        "datasets",
        cfg.datasets,
        cfg.python_bin,
        cfg.project_root,
        cfg.global_env,
        cfg.model_profile,
        run_dir,
        dry_run=dry_run,
    )
    _write_run_summary(
        run_dir,
        {
            "command": "run-datasets",
            "started_at": started_at,
            "finished_at": f"{datetime.utcnow().isoformat()}Z",
            "elapsed_seconds": elapsed,
            "model_profile": cfg.model_profile,
            "log_file": str(run_dir / "datasets.log"),
        },
    )


@app.command("run-embeddings")
def cli_run_embeddings(
    config: str = CONFIG_OPTION,
    dry_run: bool = DRY_RUN_OPTION,
) -> None:
    """Run the embeddings / llm2vec pipeline only."""
    cfg = load_factory_config(Path(config))
    if cfg.embeddings is None:
        _log_error("No 'embeddings' stage defined in config.")
        raise typer.Exit(code=1)

    run_dir = _start_run_dir(cfg.run_logs_dir, "embeddings")
    started_at = f"{datetime.utcnow().isoformat()}Z"
    elapsed = run_stage(
        "embeddings",
        cfg.embeddings,
        cfg.python_bin,
        cfg.project_root,
        cfg.global_env,
        cfg.model_profile,
        run_dir,
        dry_run=dry_run,
    )
    _write_run_summary(
        run_dir,
        {
            "command": "run-embeddings",
            "started_at": started_at,
            "finished_at": f"{datetime.utcnow().isoformat()}Z",
            "elapsed_seconds": elapsed,
            "model_profile": cfg.model_profile,
            "log_file": str(run_dir / "embeddings.log"),
        },
    )


@app.command("run-sft")
def cli_run_sft(
    task: Optional[str] = typer.Option(
        None,
        "--task",
        "-t",
        help="Specific SFT task to run (e.g. dialog, reasoning). "
        "If omitted, runs all tasks.",
    ),
    config: str = CONFIG_OPTION,
    dry_run: bool = DRY_RUN_OPTION,
) -> None:
    """
    Run the Unsloth SFT pipeline.

    By default, runs all tasks defined in config.
    Use --task to run a single one.
    """
    cfg = load_factory_config(Path(config))
    if cfg.unsloth is None:
        _log_error("No 'unsloth_sft' section defined in config.")
        raise typer.Exit(code=1)

    unsloth_cfg = cfg.unsloth
    run_label = f"run_sft_{task}" if task else "run_sft_all"
    run_dir = _start_run_dir(cfg.run_logs_dir, run_label)
    started_at = f"{datetime.utcnow().isoformat()}Z"
    summary: list[dict[str, Any]] = []

    if not unsloth_cfg.tasks:
        _log_warn("No tasks defined in 'unsloth_sft.tasks'; nothing to run.")
        _write_run_summary(
            run_dir,
            {
                "command": "run-sft",
                "started_at": started_at,
                "finished_at": f"{datetime.utcnow().isoformat()}Z",
                "elapsed_seconds": 0.0,
                "tasks": [],
                "log_dir": str(run_dir),
            },
        )
        return

    if task is not None:
        if task not in unsloth_cfg.tasks:
            _log_error(
                f"Task '{task}' not found in unsloth_sft.tasks. "
                f"Available: {', '.join(unsloth_cfg.tasks.keys())}"
            )
            raise typer.Exit(code=1)
        elapsed = run_unsloth_task(
            task_name=task,
            cfg=unsloth_cfg,
            task_cfg=unsloth_cfg.tasks[task],
            python_bin=cfg.python_bin,
            project_root=cfg.project_root,
            global_env=cfg.global_env,
            model_profile=cfg.model_profile,
            run_dir=run_dir,
            dry_run=dry_run,
        )
        _write_run_summary(
            run_dir,
            {
                "command": "run-sft",
                "task": task,
                "started_at": started_at,
                "finished_at": f"{datetime.utcnow().isoformat()}Z",
                "elapsed_seconds": elapsed,
                "tasks": [task],
                "model_profile": cfg.model_profile,
                "log_file": str(run_dir / f"unsloth_{task}.log"),
            },
        )
        return

    total_time = 0.0
    for name, task_cfg in unsloth_cfg.tasks.items():
        elapsed = run_unsloth_task(
            task_name=name,
            cfg=unsloth_cfg,
            task_cfg=task_cfg,
            python_bin=cfg.python_bin,
            project_root=cfg.project_root,
            global_env=cfg.global_env,
            model_profile=cfg.model_profile,
            run_dir=run_dir,
            dry_run=dry_run,
        )
        total_time += elapsed
        summary.append(
            {
                "task": name,
                "elapsed_seconds": elapsed,
                "log_file": str(run_dir / f"unsloth_{name}.log"),
            }
        )

    _log_info(f"All Unsloth tasks completed. Total time: {total_time:.1f} seconds.")
    _write_run_summary(
        run_dir,
        {
            "command": "run-sft",
            "started_at": started_at,
            "finished_at": f"{datetime.utcnow().isoformat()}Z",
            "elapsed_seconds": total_time,
            "tasks": summary,
            "model_profile": cfg.model_profile,
            "log_dir": str(run_dir),
        },
    )


@app.command("run-export")
def cli_run_export(
    config: str = CONFIG_OPTION,
    dry_run: bool = DRY_RUN_OPTION,
) -> None:
    """Run the GGUF export followed by mandatory MLC-format packaging."""
    cfg = load_factory_config(Path(config))
    if cfg.export is None:
        _log_error("No 'export' stage defined in config.")
        raise typer.Exit(code=1)
    if cfg.mlc_export is None or not cfg.mlc_export.enabled:
        _log_error(
            "MLC export is required for monGARS_webLLM builds. Configure 'mlc_export' and ensure it is enabled."
        )
        raise typer.Exit(code=1)

    run_dir = _start_run_dir(cfg.run_logs_dir, "export")
    started_at = f"{datetime.utcnow().isoformat()}Z"
    summary: list[dict[str, Any]] = []

    gguf_elapsed = run_stage(
        "export",
        cfg.export,
        cfg.python_bin,
        cfg.project_root,
        cfg.global_env,
        cfg.model_profile,
        run_dir,
        dry_run=dry_run,
    )
    summary.append({"name": "export", "elapsed_seconds": gguf_elapsed, "log_file": str(run_dir / "export.log")})

    mlc_elapsed = run_stage(
        "mlc_export",
        cfg.mlc_export,
        cfg.python_bin,
        cfg.project_root,
        cfg.global_env,
        cfg.model_profile,
        run_dir,
        dry_run=dry_run,
    )
    summary.append(
        {"name": "mlc_export", "elapsed_seconds": mlc_elapsed, "log_file": str(run_dir / "mlc_export.log")}
    )

    _write_run_summary(
        run_dir,
        {
            "command": "run-export",
            "started_at": started_at,
            "finished_at": f"{datetime.utcnow().isoformat()}Z",
            "elapsed_seconds": gguf_elapsed + mlc_elapsed,
            "model_profile": cfg.model_profile,
            "log_files": summary,
        },
    )


@app.command("run-all")
def cli_run_all(
    config: str = CONFIG_OPTION,
    dry_run: bool = DRY_RUN_OPTION,
) -> None:
    """
    Run the full monGARS model factory:

        datasets → embeddings → Unsloth SFT (all tasks) → export+quant → mlc export

    Respects the 'enabled' flag for each stage in the config.
    """
    cfg = load_factory_config(Path(config))

    grand_total = 0.0
    summary: list[dict[str, Any]] = []
    started_at = f"{datetime.utcnow().isoformat()}Z"
    run_dir = _start_run_dir(cfg.run_logs_dir, "run_all")
    exit_code = 0

    def _record_stage(
        name: str,
        stage_cfg: Optional[StageConfig],
        *,
        required: bool = False,
        required_note: Optional[str] = None,
    ) -> None:
        nonlocal grand_total, exit_code
        if stage_cfg is not None and stage_cfg.enabled:
            elapsed = run_stage(
                name,
                stage_cfg,
                cfg.python_bin,
                cfg.project_root,
                cfg.global_env,
                cfg.model_profile,
                run_dir,
                dry_run=dry_run,
            )
            grand_total += elapsed
            summary.append(
                {
                    "name": name,
                    "status": "ran",
                    "elapsed": elapsed,
                    "note": str(run_dir / f"{name}.log"),
                }
            )
            return

        note = "disabled" if stage_cfg is not None else "not configured"
        if required:
            _log_error(required_note or f"{name} stage is required for this build.")
            exit_code = 1
        else:
            _log_warn(f"{name.capitalize()} stage {note}; skipping.")
        summary.append({"name": name, "status": "skipped", "elapsed": 0.0, "note": note})

    def _handle_unsloth() -> None:
        nonlocal grand_total
        if cfg.unsloth is not None and cfg.unsloth.enabled:
            if cfg.unsloth.tasks:
                for name, task_cfg in cfg.unsloth.tasks.items():
                    elapsed = run_unsloth_task(
                        task_name=name,
                        cfg=cfg.unsloth,
                        task_cfg=task_cfg,
                        python_bin=cfg.python_bin,
                        project_root=cfg.project_root,
                        global_env=cfg.global_env,
                        model_profile=cfg.model_profile,
                        run_dir=run_dir,
                        dry_run=dry_run,
                    )
                    grand_total += elapsed
                    summary.append(
                        {
                            "name": f"unsloth:{name}",
                            "status": "ran",
                            "elapsed": elapsed,
                            "note": str(run_dir / f"unsloth_{name}.log"),
                        }
                    )
                return

            _log_warn("Unsloth SFT enabled but no tasks defined; skipping.")
            summary.append(
                {
                    "name": "unsloth",
                    "status": "skipped",
                    "elapsed": 0.0,
                    "note": "no tasks",
                }
            )
            return

        note = "disabled" if cfg.unsloth is not None else "not configured"
        _log_warn(f"Unsloth SFT stage {note}; skipping.")
        summary.append({"name": "unsloth", "status": "skipped", "elapsed": 0.0, "note": note})

    _record_stage("datasets", cfg.datasets)
    _record_stage("embeddings", cfg.embeddings)
    _handle_unsloth()
    _record_stage("export", cfg.export)
    _record_stage(
        "mlc_export",
        cfg.mlc_export,
        required=True,
        required_note=(
            "MLC export stage is required for monGARS_webLLM deployment. Configure 'mlc_export' and keep it enabled."
        ),
    )

    _log_box("PIPELINE COMPLETED")
    _log_info(f"Total elapsed time for full pipeline: {grand_total:.1f} seconds.")
    _log_summary_table(summary)
    _write_run_summary(
        run_dir,
        {
            "command": "run-all",
            "started_at": started_at,
            "finished_at": f"{datetime.utcnow().isoformat()}Z",
            "elapsed_seconds": grand_total,
            "stages": summary,
            "model_profile": cfg.model_profile,
            "log_dir": str(run_dir),
        },
    )
    if exit_code:
        raise typer.Exit(code=exit_code)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    app()


if __name__ == "__main__":
    main()
