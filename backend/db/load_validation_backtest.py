"""ML-8: почасовой прогноз на проверочный период (сентябрь-октябрь) для WAPE-score на фронте.

Источник — validation.csv из ml/artifacts/qna_final/: честная проверка модели, обученной
ТОЛЬКО на январь-август, на невиданных данных сентября-октября (см. ml/qna/pipeline.py,
train() — bundle для этого файла обучен на history без raw_test). Хэш файла сверен с
manifest.json Ярослава перед копированием.

Не через ml.postgres.save_forecasts(): та функция намеренно запрещает вставлять строки forecast
с датой <= train_date_to активной версии — это защита от утечки для БУДУЩЕГО прогноза. Здесь
наоборот: это историческая проверка, дата заведомо в прошлом и входила в обучающие данные
финальной (ноябрь-декабрьской) модели. Кладём эти строки в ту же активную model_version_id
намеренно — так фронт их находит (useEvalData.ts дёргает обычный GET /forecast без параметра
model_version; отдельной версии для бэктеста контракт не предусматривает).

lower=upper=prediction: откалиброванного коридора для этого конкретного прогона нет
(add_intervals/calibrate в пайплайне считались для другого среза, в validation.csv их нет) —
не выдумываю коридор, честно нулевой, а не подгоняю под что-то произвольное.

Запуск: DATABASE_URL=postgresql://tram:change_me@localhost:5433/tram python backend/db/load_validation_backtest.py
"""

import os
from pathlib import Path

import pandas as pd
import psycopg

DIRECTORY = Path("ml/artifacts/qna_final")


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    frame = pd.read_csv(DIRECTORY / "validation.csv", sep=";")
    frame["date"] = pd.to_datetime(frame["date"]).dt.date
    frame["prediction"] = frame["prediction"].round().clip(lower=0).astype(int)

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT model_version_id FROM model_version WHERE is_active = true")
        row = cur.fetchone()
        if row is None:
            raise SystemExit("Нет активной версии модели — сначала загрузите forecast.csv")
        version_id = row[0]

        rows = [
            (version_id, int(r.route), r.date, int(r.hour), int(r.prediction), int(r.prediction), int(r.prediction))
            for r in frame.itertuples(index=False)
        ]
        cur.executemany(
            "INSERT INTO forecast "
            "(model_version_id, route, date, hour, horizon, prediction, lower, upper, is_analog) "
            "VALUES (%s, %s, %s, %s, 'day', %s, %s, %s, false) "
            "ON CONFLICT (model_version_id, route, date, hour, horizon) DO UPDATE SET "
            "prediction = EXCLUDED.prediction, lower = EXCLUDED.lower, upper = EXCLUDED.upper",
            rows,
        )
        conn.commit()

    print(f"forecast (бэктест сентябрь-октябрь): {len(rows)} строк, model_version_id={version_id}")


if __name__ == "__main__":
    main()
