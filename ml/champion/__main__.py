"""Запуск из корня репозитория: python -m ml.champion verify."""

import argparse
import logging
import os
from pathlib import Path

from ml.champion.runtime import download, forecast, load_bundle, verify
from ml.config import Config, setup_logging


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["download", "verify", "predict", "train"])
    parser.add_argument(
        "--directory",
        type=Path,
        default=Path(os.getenv("ML_CHAMPION_DIR", "ml/artifacts/champion")),
    )
    parser.add_argument("--start", default="2025-11-01")
    parser.add_argument("--end", default="2025-12-31")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--online", action="store_true")
    args = parser.parse_args()
    if args.command == "download":
        download(args.directory)
    elif args.command == "verify":
        verify(args.directory)
    elif args.command == "predict":
        frame = forecast(load_bundle(args.directory), args.start, args.end)
        output = args.output or args.directory / "test_submission.csv"
        protected = {args.directory / name for name in ("bundle.joblib", "submission.csv")}
        if output.resolve() in {path.resolve() for path in protected}:
            raise ValueError("Эталонные артефакты не перезаписываются")
        output.parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(output, sep=";", index=False)
        logging.info("Сохранено %s строк: %s", len(frame), output)
    else:
        from ml.champion.train import train

        config = Config()
        output = args.output or Path("ml/artifacts/champion_retrained")
        train(config.data, config.cache, output, args.online, config.threads)


if __name__ == "__main__":
    main()
