"""Загрузка готового прогноза Ярослава (ml/artifacts/qna_final/) в БД.

Не переизобретаю загрузку сам — вызываю его же проверенный ml.postgres.save_forecasts
(там уже есть вся нужная валидация границ, дублей, пересечения с периодом обучения).
manifest.json ссылается на файлы, которых нет в переданном наборе (MODEL_CARD.md,
factor_contribution.csv и т.п.) — полную ml.qna.verify() не гоняем, только сохраняем
forecast.csv + model_quality.csv.

Запуск из корня репозитория:
ML_DATABASE_URL=postgresql://tram:change_me@localhost:5433/tram python backend/db/load_forecast.py
"""

import json
import os
from pathlib import Path

import pandas as pd

from ml.postgres import ModelVersion, save_forecasts

DIRECTORY = Path("ml/artifacts/qna_final")


def main() -> None:
    database_url = os.environ["ML_DATABASE_URL"]
    metadata = json.loads((DIRECTORY / "model_version.json").read_text(encoding="utf-8"))
    version = ModelVersion(
        version_name=metadata["version_name"],
        algorithm=metadata["algorithm"],
        trained_at=pd.Timestamp(metadata["trained_at"]).to_pydatetime(),
        train_date_from=pd.Timestamp(metadata["train_date_from"]).date(),
        train_date_to=pd.Timestamp(metadata["train_date_to"]).date(),
    )
    forecast = pd.read_csv(DIRECTORY / "forecast.csv", sep=";")
    model_quality = pd.read_csv(DIRECTORY / "model_quality.csv", sep=";")
    version_id = save_forecasts(
        database_url,
        forecast,
        version,
        activate=True,
        auxiliary={"model_quality": model_quality},
    )
    print(f"model_version_id={version_id}, строк forecast={len(forecast)}")


if __name__ == "__main__":
    main()
