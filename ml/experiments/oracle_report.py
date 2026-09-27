"""Отчёт из измеренных результатов будущих внешних данных и восстановления."""

import argparse
import json
import shutil
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--experiment", type=Path, default=Path("ml/artifacts/oracle_weather_experiment")
    )
    parser.add_argument("--delivery", type=Path, default=Path("ml/artifacts/oracle_delivery"))
    parser.add_argument("--reports", type=Path, default=Path("ml/reports/oracle"))
    parser.add_argument("--document", type=Path, default=Path("ml/ORACLE_EXPERIMENT.md"))
    args = parser.parse_args()
    results = json.loads((args.experiment / "manifest.json").read_text())
    delivery = json.loads((args.delivery / "delivery.json").read_text())
    scores = pd.read_csv(args.experiment / "scores.csv", sep=";")
    validation = scores[scores.period.eq("validation")]
    best = results["candidates"]["validation_selected"]
    controlled = validation[
        validation.base.eq(best["base"])
        & validation.trees.eq(best["trees"])
        & validation.weight.eq(best["weight"])
    ]
    weather_control = controlled[controlled["mode"].eq("climatology")].iloc[0]
    delta = best["score_original"] - weather_control.score_original
    lines = [
        "# Фактические внешние данные и восстановление провалов",
        "",
        "Локальный эксперимент. Код, отчёт и артефакты не опубликованы; в PostgreSQL записи не выполнялись.",
        "",
        "## Протокол",
        "",
        "Обучение январь–август, проверка сентябрь–октябрь 2025. "
        "Метрика ниже рассчитана по исходным labels: WAPE-score = max(0, 1 − Σ|y−ŷ|/Σy). "
        "Оцениваются девять маршрутов; №5 исключён. Часы 01–04 исключены из обучения, прогноз в них равен нулю. "
        "Час 05 сохранён. Исходные labels и проверочные пассажиропотоки не исправлялись.",
        "",
        "Сравнены 128 конфигураций на каждом из двух периодов: июль–август и сентябрь–октябрь. "
        "Четыре набора внешних признаков, две базы остатка, 150/500 деревьев LightGBM, восемь весов. "
        "Все модели обучались с regression_l1. Пассажирские профили строились по предыдущим временным блокам. "
        "Метки пассажиропотока ноября–декабря не использовались.",
        "",
        "**Это намеренное использование будущих внешних данных:** реанализ ERA5 для целевых дат, "
        "фактически зарегистрированные ДТП 2025 года и поздний снимок карточек мероприятий. "
        "Такая информация недоступна при реальном прогнозе на два месяца вперёд. "
        "Эксперимент не заменяет режим прогноза погоды на завтра или климатологии на месяц.",
        "",
        "## Результат",
        "",
        "| Вариант | WAPE-score, сентябрь–октябрь |",
        "|---|---:|",
        f"| Текущий выпуск после Q&A | {results['control_score_original']:.9f} |",
        f"| Лучший вариант перебора с фактической погодой | {best['score_original']:.9f} |",
        f"| Те же параметры, климатология вместо фактической погоды | {weather_control.score_original:.9f} |",
        f"| Конфигурация, выбранная на июле–августе | {results['candidates']['development_selected']['score_original']:.9f} |",
        "",
        f"Лучший вариант: {best['trees']} деревьев, остаток относительно сезонного профиля, "
        f"доля поправки модели {best['weight']:.0%}. Чистый измеренный эффект фактической суточной погоды "
        f"при одинаковых параметрах: **{delta:+.9f}**. Остальной прирост связан с изменением параметров. "
        "Подбор лучшего варианта использовал сентябрь–октябрь; это просмотренная валидация, не независимый тест. "
        "Результат нового сабмита на платформе пока неизвестен.",
        "",
        "| Признаки при одинаковых параметрах | WAPE-score |",
        "|---|---:|",
    ]
    for row in controlled.itertuples(index=False):
        lines.append(f"| {row.mode} | {row.score_original:.9f} |")
    lines += [
        "",
        "Почасовая погода и добавление фактических ДТП/событий не улучшили лучший результат. "
        "Эти эксперименты не доказывают положительный вклад всех четырёх категорий внешних факторов.",
        "",
        "## Источники",
        "",
        "- [Open-Meteo, Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api): "
        "8760 часов и 365 дней 2025, Москва, ERA5. Это реанализ, не архив прогнозов. "
        "Температура, осадки, снегопад, ветер; в почасовом варианте дополнительно влажность и облачность. "
        "Высота снега отсутствует во всём ответе и исключена, а не заменена нулём.",
        "- [Производственный календарь РФ](https://xmlcalendar.ru/data/ru/2025/calendar.json): "
        "праздники, рабочие/выходные переносы; одинаков во всех вариантах.",
        "- [ДТП, открытые данные](https://dtp-stat.ru/opendata/): 8354 записи с датами 2025, "
        "почасовые и суточные количества по Москве. Это ДТП, не измеренные пробки.",
        "- [KudaGo](https://kudago.com/public-api/v1.4/events/): "
        "число активных карточек и краткосрочных мероприятий. Полнота исторического каталога не гарантирована.",
        "- [OpenStreetMap](https://www.openstreetmap.org/): прежний признак дорожной сети сохранён. "
        "Геометрия дорог не равна наблюдаемой загруженности транспорта.",
        "",
        "## Провалы",
        "",
        "Детектор ищет дни с потоком менее 15% ожидаемого и не более 25% ненулевых рабочих часов. "
        "Аналоги — только предыдущие 56 дней того же дня недели и типа календарного дня; минимум четыре дня. "
        "Восстановление — медианный почасовой профиль. Особые календарные дни исключены. "
        "Найдены четыре кандидата, все у маршрута 50. Ни ремонт, ни потеря связи документально не установлены; "
        "реальное отсутствие движения также возможно.",
        "",
        "| Дата | Исходная суточная сумма | Восстановленная сумма | Последний аналог |",
        "|---|---:|---:|---|",
    ]
    audit = pd.read_csv(args.delivery / "restoration_audit.csv", sep=";")
    for row in audit.itertuples(index=False):
        lines.append(f"| {row.date} | {row.observed} | {row.restored} | {row.latest_analog} |")
    lines += [
        "",
        "Дополнительная проверка восстановления: обучение январь–сентябрь, проверка на неизменённых "
        "данных октября. Её метрика не сопоставляется напрямую с проверкой сентября–октября выше.",
        "",
        "| Восстановление обучающих провалов | WAPE-score, октябрь |",
        "|---|---:|",
    ]
    for row in delivery["restoration_check"]:
        lines.append(f"| {'Да' if row['repair'] else 'Нет'} | {row['score_original']:.9f} |")
    lines += [
        "",
        "Результат восстановления: "
        + (
            "на октябре получено улучшение."
            if delivery["repair_improved_october"]
            else "улучшения на октябре нет."
        )
        + " Восстановленный сабмит сохранён отдельно как сценарий, исходные файлы не перезаписаны.",
        "",
        "## Горизонты и файлы",
        "",
        "Артефакты находятся в `ml/artifacts/oracle_delivery/`: `validation_selected/` — лучший "
        "вариант просмотренной валидации, `development_selected/` — выбор по июлю–августу, "
        "`restored/` — вариант с восстановлением. В каждом каталоге:",
        "",
        "- `test_submission.csv`: 14640 строк, 10 маршрутов, 61 день, 24 часа; №5 и часы 01–04 равны нулю.",
        "- `forecast_hourly.csv`: день по часам, 13176 строк девяти маршрутов, lower/upper.",
        "- `forecast_daily.csv`: месяц по дням, 549 строк, hour=NULL; prediction равна сумме часов.",
        "- `forecast_week_example.csv`: семь суток по дням, 63 строки; в DDL horizon=month, "
        "поскольку отдельного enum week нет.",
        "- `forecast.csv`: объединённые 13725 строк ровно под поля forecast; "
        "`model_version.json`, `bundle.joblib`, происхождение внешних данных и SHA256-манифест.",
        "",
        "Коридоры ошибок рассчитаны отдельно для часов и суток; номинал 80%, без гарантии покрытия. "
        "Для варианта restored калибровка на октябре, для остальных на сентябре–октябре. "
        "Маршрут 5 не записывается как наблюдаемый маршрут в пакет БД. "
        "Годовой горизонт в этом экспериментальном выпуске не реализован: фактические внешние данные "
        "ограничены 2025 годом. Область определения — девять московских маршрутов, ноябрь–декабрь 2025; "
        "перенос требует новых внешних данных, профилей и проверки на следующем временном периоде.",
        "",
        "## Повторение",
        "",
        "Из корня репозитория, после установки `ml/requirements.txt` и подготовки исходного кэша:",
        "",
        "```powershell",
        "python -m ml.experiments.oracle_inputs --cache PATH_TO_CACHE",
        "python -m ml.experiments.oracle_weather --data PATH_TO_DATA --cache PATH_TO_CACHE",
        "python -m ml.experiments.oracle_delivery --data PATH_TO_DATA --cache PATH_TO_CACHE",
        "python -m ml.experiments.oracle_report",
        "```",
        "",
        "Если входные данные уже загружены, первый шаг пропускается. Непустые каталоги моделей "
        "не перезаписываются — для повторного запуска укажите новые `--output`/`--experiment`/`--delivery`. "
        "Пакет зависит от исходного кэша календаря, погоды 2022–2024, ДТП и карточек событий; "
        "их происхождение сохранено вместе с моделью. Для сравнения используйте одни и те же снимки.",
        "",
        "Полные результаты: [scores.csv](reports/oracle/scores.csv), "
        "[restoration_scores.csv](reports/oracle/restoration_scores.csv), "
        "[restoration_audit.csv](reports/oracle/restoration_audit.csv).",
    ]
    args.reports.mkdir(parents=True, exist_ok=True)
    for source in (
        args.experiment / "scores.csv",
        args.experiment / "manifest.json",
        args.delivery / "delivery.json",
        args.delivery / "restoration_scores.csv",
        args.delivery / "restoration_audit.csv",
    ):
        shutil.copy2(source, args.reports / source.name)
    args.document.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
