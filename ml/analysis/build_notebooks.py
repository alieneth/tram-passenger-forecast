"""Создание аналитических ноутбуков из сохранённых агрегатов и результатов модели."""

from pathlib import Path
from textwrap import dedent

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]

SETUP = """
from pathlib import Path
import json
import hashlib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.figure import Figure
from IPython.display import display

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "ml/reports").is_dir())
REPORTS = ROOT / "ml/reports"
FIGURES = ROOT / "ml/reports/figures"
FIGURES.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11,
    "axes.spines.top": False, "axes.spines.right": False, "axes.titleweight": "bold",
    "figure.figsize": (11, 5), "axes.grid": True, "grid.alpha": 0.18,
    "axes.axisbelow": True, "figure.facecolor": "white", "savefig.facecolor": "white"})
BLUE, TEAL, ORANGE = "#234E70", "#008A85", "#D57433"

def finish(fig: Figure, name: str) -> None:
    fig.tight_layout()
    fig.savefig(FIGURES / f"{name}.png", dpi=160, bbox_inches="tight")
    display(fig)
    plt.close(fig)
"""


def markdown(text: str) -> nbf.NotebookNode:
    return nbf.v4.new_markdown_cell(dedent(text).strip())


def code(text: str) -> nbf.NotebookNode:
    return nbf.v4.new_code_cell(dedent(text).strip())


def save(name: str, cells: list[nbf.NotebookNode]) -> None:
    notebook = nbf.v4.new_notebook(cells=cells)
    notebook.metadata.kernelspec = {
        "display_name": "Python 3",
        "language": "python",
        "name": "python3",
    }
    notebook.metadata.language_info = {"name": "python", "version": "3.12"}
    output = ROOT / "notebooks" / name
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="\n") as stream:
        nbf.write(notebook, stream)


def data_notebook() -> None:
    cells = [
        markdown("""
        # Разведывательный анализ пассажиропотока трамвайных маршрутов

        **Объект:** успешные валидации по маршруту и календарному часу в московском времени.
        История: январь–октябрь 2025. Обучающий период — январь–август,
        проверочный — сентябрь–октябрь. Цель `boardings` — число записей с `validation_result = 1`.

        Полный аудит исходных 62,4 млн строк выполнен потоково через DuckDB (`ml/data_audit.py`,
        `ml/audit_raw.py`). Здесь используются его результаты и компактные маршрутные агрегаты:
        ноутбук воспроизводится без загрузки 10 ГБ транзакций в память и без доступа к сети.
        Хеши карт и отдельные транзакции не включены. Это повторный анализ результатов полного
        аудита, а не повторное чтение raw при каждом запуске ноутбука.
        """),
        code(SETUP),
        markdown("## 1. Объём, целевая переменная и контроль исходных данных"),
        code("""
        audit = json.loads((REPORTS / "data_quality/report.json").read_text(encoding="utf-8"))
        raw = json.loads((REPORTS / "eda/raw_reconciliation.json").read_text(encoding="utf-8"))
        manifest = json.loads((REPORTS / "eda/manifest.json").read_text(encoding="utf-8"))
        for name, digest in manifest["output_sha256"].items():
            assert hashlib.sha256((REPORTS / "eda" / name).read_bytes()).hexdigest() == digest
        files = pd.DataFrame(audit["files"]).T
        assert int(files.rows.sum()) == 62443497
        assert raw["passed"] and all(v["mismatch_keys"] == 0 for v in raw["repartitioned"].values())
        display(pd.DataFrame(raw["repartitioned"]).T[["raw_boardings", "label_boardings", "label_rows", "mismatch_keys"]])
        display(files[["rows", "input_before_transaction", "begin_after_transaction"]])
        """),
        markdown("""
        Границы определяются временем `tran_date_time`, а не именем файла. 523 успешные операции
        1 сентября из физического train относятся к проверке; 562 операции 1 ноября из test
        исключены из истории. После переразбиения число входов совпадает с labels на каждом ключе.
        `place_id` обозначает площадку депо, не остановку. GPS и высадок в исходных валидациях нет.
        """),
        markdown("## 2. Пропуски и согласованность полей"),
        code("""
        fields = ["pass_route", "begin_date_time", "garage_number", "place_id", "good_type", "bus_exit_no"]
        missing = pd.DataFrame({split: [100 * files.loc[split, f"{field}_missing"] / files.loc[split, "rows"] for field in fields] for split in files.index}, index=fields)
        display(missing.rename_axis("field").round(4))
        fig, ax = plt.subplots(figsize=(11, 5))
        missing.plot.barh(ax=ax, color=[BLUE, TEAL])
        ax.set(xlabel="Доля пропусков, %", ylabel="Поле", title="Пропуски в сырых валидациях")
        ax.legend(title="Физический файл")
        finish(fig, "01_missing_values")
        """),
        markdown("""
        Около 46% `pass_route` отсутствует: такой пропуск нельзя приравнивать к отсутствию пересадки.
        Пропуски `bus_exit_no` редки, но будущий выпуск трамваев не известен из этих исторических данных.
        Несогласованность `begin_date_time` требует уточнения семантики поля; она не используется
        как автоматическое основание удалять посадки.
        """),
        code("""
        assert audit["exact_duplicates"]["groups"] == 0
        assert audit["targets"]["label_duplicate_keys"] == 0
        invalid = files.filter(regex="invalid_|unexpected_card_hash_format").sum(axis=1)
        assert invalid.eq(0).all()
        display(pd.DataFrame({"Проверка": ["Точные дубли всех 14 полей", "Дубли ключей labels", "Невалидные значения проверенных типов"], "Количество": [0, 0, int(invalid.sum())]}))
        """),
        markdown("## 3. Полнота временной сетки и отсутствие истории маршрута №5"),
        code("""
        coverage = pd.read_csv(REPORTS / "data_quality/route_quality.csv", sep=";").set_index("route")
        assert int(coverage.grid_hours.sum()) == 65664
        assert int(coverage.absent_hours.sum()) == 8113
        assert 5 not in coverage.index
        fig, ax = plt.subplots(figsize=(11, 4.5))
        ax.bar(coverage.index.astype(str), 100 * coverage.absent_hours / coverage.grid_hours, color=BLUE)
        ax.set(xlabel="Маршрут", ylabel="Отсутствующие агрегаты, %", title="Покрытие часов: 8113 отсутствующих агрегатов у 9 известных маршрутов")
        finish(fig, "02_hour_coverage")
        display(coverage[["supplied_hours", "grid_hours", "absent_hours", "zero_days", "max_hour"]])
        """),
        markdown("""
        Отсутствующие часы известных маршрутов восстанавливаются нулями по определению счётчика
        успешных валидаций. Это не доказывает отсутствие движения или исправность валидаторов.
        У №5 отсутствует вся история; его нельзя считать десятым маршрутом с наблюдаемым нулевым
        спросом и использовать для искусственного уменьшения MAE.
        """),
        markdown("## 4. Динамика и сезонность"),
        code("""
        daily = pd.read_csv(REPORTS / "data_quality/daily_counts.csv", sep=";", parse_dates=["date"])
        totals = daily.groupby("date")["sum"].sum()
        fig, ax = plt.subplots(figsize=(12, 4.8))
        ax.plot(totals.index, totals / 1000, color=BLUE, linewidth=1, alpha=0.45, label="По дням")
        ax.plot(totals.index, totals.rolling(7, min_periods=1).mean() / 1000, color=TEAL, linewidth=2, label="Среднее за 7 дней")
        ax.axvspan(pd.Timestamp("2025-09-01"), pd.Timestamp("2025-10-31"), color=ORANGE, alpha=0.12, label="Проверочный период")
        ax.xaxis.set_major_locator(mdates.MonthLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m.%Y"))
        ax.set(xlabel="Дата", ylabel="Тысяч входов в сутки", title="Пассажиропоток: январь–октябрь 2025")
        ax.legend(ncol=3, loc="upper left")
        finish(fig, "03_daily_demand")
        """),
        markdown("""
        Недельные колебания и изменение уровня спроса мотивируют признаки дня недели, часа и сезона.
        Семидневная кривая используется только для визуального анализа; она не добавляет будущие
        наблюдения в признаки модели.
        """),
        code("""
        profiles = pd.read_csv(REPORTS / "eda/hourly_profiles.csv", sep=";")
        train_profiles = profiles[profiles.split == "train"]
        grouped = train_profiles.groupby(["route", "hour"])[["total", "rows"]].sum()
        heat = (grouped.total / grouped.rows).unstack("hour")
        fig, ax = plt.subplots(figsize=(12, 5))
        im = ax.imshow(heat.to_numpy(), aspect="auto", cmap="YlGnBu")
        ax.set(xticks=range(24), yticks=range(len(heat)), yticklabels=heat.index.astype(str), xlabel="Час, Москва", ylabel="Маршрут", title="Средние входы по маршруту и часу: только январь–август")
        ax.grid(False)
        fig.colorbar(im, ax=ax, label="Входов за час")
        finish(fig, "04_route_hour_profiles")
        """),
        code("""
        grouped = train_profiles.groupby(["dayofweek", "hour"])[["total", "rows"]].sum()
        weekday = (grouped.total / grouped.rows).unstack("hour")
        fig, ax = plt.subplots(figsize=(12, 4.3))
        im = ax.imshow(weekday.to_numpy(), aspect="auto", cmap="YlGnBu")
        ax.set(xticks=range(24), yticks=range(7), yticklabels=["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], xlabel="Час, Москва", title="Недельный профиль: среднее на один маршрут-час")
        ax.grid(False)
        fig.colorbar(im, ax=ax, label="Входов за час")
        finish(fig, "05_weekday_hour_profiles")
        """),
        markdown("## 5. Различия масштабов маршрутов"),
        code("""
        routes = sorted(daily.route.unique())
        fig, ax = plt.subplots(figsize=(11, 5))
        ax.boxplot([daily.loc[daily.route == route, "sum"].to_numpy() / 1000 for route in routes], tick_labels=[str(r) for r in routes], showfliers=False, patch_artist=True, boxprops={"facecolor": "#BFDFDE"}, medianprops={"color": BLUE, "linewidth": 2})
        ax.set(xlabel="Маршрут", ylabel="Тысяч входов в сутки", title="Распределение суточного спроса по маршрутам")
        finish(fig, "06_route_daily_distribution")
        """),
        markdown("""
        Масштаб спроса заметно различается между маршрутами. Общий WAPE взвешивает ошибки через
        суммарный поток; поэтому общую метрику необходимо дополнять маршрутными MAE и WAPE.
        На графике выбросы скрыты только для читаемости, исходные наблюдения не удалены.
        """),
        markdown("## 6. Аномалии и границы интерпретации"),
        code("""
        anomalies = pd.read_csv(REPORTS / "data_quality/hourly_anomaly_candidates.csv", sep=";")
        assert len(anomalies) == 80
        display(anomalies[["route", "date", "hour", "boardings", "median", "robust_deviation"]].head(10))
        section = daily[(daily.route == 50) & daily.date.between("2025-09-10", "2025-09-30")]
        fig, ax = plt.subplots(figsize=(11, 4.5))
        ax.plot(section.date, section["sum"] / 1000, color=BLUE, marker="o", markersize=4)
        ax.axvspan(pd.Timestamp("2025-09-20"), pd.Timestamp("2025-09-21"), color=ORANGE, alpha=0.2)
        ax.annotate("21.09: 0 входов", xy=(pd.Timestamp("2025-09-21"), 0), xytext=(pd.Timestamp("2025-09-23"), 10), arrowprops={"arrowstyle": "->", "color": ORANGE})
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d.%m"))
        ax.set(xlabel="Дата", ylabel="Тысяч входов в сутки", title="Маршрут 50: локальное падение зарегистрированного спроса")
        finish(fig, "07_route50_anomaly")
        assert int(section.loc[section.date.eq("2025-09-21"), "sum"].iloc[0]) == 0
        """),
        markdown("""
        80 часов выделены правилом отклонения от медианы более чем на 8 робастных масштабов.
        Медиана и MAD рассчитаны по январю–августу; минимальный масштаб — 10 входов.
        Это кандидаты для разбора, не доказанные ошибки. У №50 20 сентября зарегистрировано
        304 входа, 21 сентября — ноль. Без дополнительных данных нельзя отделить ограничения
        движения от потери регистрации. Эти дни сохранены в оценке качества.

        **Выводы для модели:** сохранять часовые и недельные профили; учитывать календарные переносы;
        анализировать ошибки отдельно по маршрутам; не использовать будущий выпуск вагонов или
        будущие валидации как признаки; №5 оценивать отдельным методом холодного старта.
        """),
    ]
    save("01_data_quality_and_eda.ipynb", cells)


def validation_notebook() -> None:
    cells = [
        markdown("""
        # Проверка модели и внешних факторов

        Прогноз на сентябрь–октябрь 2025 получен из истории до 31 августа. Финальное обучение
        для ноябрь–декабрь использует январь–октябрь. Здесь проверяется сохранённая конфигурация:
        98% сезонного медианного профиля и 2% LightGBM MAE. №5 не входит в локальные метрики,
        поскольку фактической истории для него нет.

        Осенний период использовался при разработке: результаты диагностические, не оценка
        нового независимого теста. Эксперименты с источниками оцениваются отдельно от основного
        прогноза и от скрытой платформы.
        """),
        code(SETUP),
        markdown("## 1. Пересчёт метрик из почасовых предсказаний"),
        code("""
        frame = pd.read_csv(REPORTS / "eda/validation_predictions.csv", sep=";", parse_dates=["date"])
        assert len(frame) == 13176 and 5 not in set(frame.route)
        assert not frame.duplicated(["route", "date", "hour"]).any()
        frame["error"] = frame.prediction - frame.boardings
        frame["absolute_error"] = frame.error.abs()
        frame["baseline_absolute_error"] = (frame.baseline_prediction - frame.boardings).abs()
        score = 1 - frame.absolute_error.sum() / frame.boardings.sum()
        assert np.isclose(score, 0.8920614645158826, atol=1e-12, rtol=0)
        metrics = pd.DataFrame({"MAE": [frame.baseline_absolute_error.mean(), frame.absolute_error.mean()], "WAPE-score": [1-frame.baseline_absolute_error.sum()/frame.boardings.sum(), score]}, index=["Среднее: маршрут × день недели × час", "Гибридная модель"])
        display(metrics.round(6))
        """),
        markdown("## 2. Ошибки по маршрутам и времени"),
        code("""
        errors = frame.groupby("route")[["absolute_error", "baseline_absolute_error"]].mean()
        fig, ax = plt.subplots(figsize=(11, 5))
        errors.rename(columns={"absolute_error": "Модель", "baseline_absolute_error": "Средний baseline"}).plot.barh(ax=ax, color=[TEAL, BLUE])
        ax.set(xlabel="MAE, входов за час", ylabel="Маршрут", title="MAE по маршрутам: сентябрь–октябрь")
        finish(fig, "08_route_validation_mae")
        """),
        code("""
        daily = frame.groupby("date")[["boardings", "prediction", "baseline_prediction"]].sum()
        fig, ax = plt.subplots(figsize=(12, 4.7))
        ax.plot(daily.index, daily.boardings / 1000, color=BLUE, label="Факт", linewidth=2)
        ax.plot(daily.index, daily.prediction / 1000, color=TEAL, label="Модель", linewidth=1.5)
        ax.plot(daily.index, daily.baseline_prediction / 1000, color=ORANGE, label="Средний baseline", alpha=0.75, linestyle="--")
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d.%m"))
        ax.set(xlabel="Дата", ylabel="Тысяч входов за сутки", title="Факт и прогноз: сумма по девяти маршрутам")
        ax.legend(ncol=3)
        finish(fig, "09_actual_vs_forecast")
        by_route_day = frame.groupby(["route", "date"])[["boardings", "prediction", "baseline_prediction"]].sum()
        daily_metrics = {"model_mae_route_day": float((by_route_day.prediction-by_route_day.boardings).abs().mean()), "baseline_mae_route_day": float((by_route_day.baseline_prediction-by_route_day.boardings).abs().mean()), "scope": "route-day sums, not hourly submission metric"}
        display(pd.Series(daily_metrics))
        """),
        code("""
        by_hour = frame.groupby("hour")[["absolute_error", "baseline_absolute_error"]].mean()
        fig, ax = plt.subplots(figsize=(11, 4.2))
        ax.plot(by_hour.index, by_hour.absolute_error, color=TEAL, marker="o", label="Модель")
        ax.plot(by_hour.index, by_hour.baseline_absolute_error, color=BLUE, linestyle="--", label="Средний baseline")
        ax.set(xticks=range(24), xlabel="Час, Москва", ylabel="MAE, входов за час", title="Распределение ошибки по часу суток")
        ax.legend()
        finish(fig, "10_hourly_error")
        """),
        markdown("""
        Суточная агрегация сглаживает почасовые ошибки и не заменяет метрику сабмита.
        Проверка включает все 24 часа. Аномальные дни не удаляются. Для каждого маршрута
        используются одинаковые даты и часы при сравнении с baseline.
        """),
        markdown("## 3. Совместное влияние четырёх источников"),
        code("""
        summary = pd.read_csv(REPORTS / "champion/overall_source_effect/summary.csv", sep=";").set_index("variant")
        assert summary.rows.eq(39744).all()
        for _, row in summary.iterrows():
            assert np.isclose(row.wape_score, 1-row.absolute_error/row.target_sum)
        display(summary[["rows", "mae", "wape_score", "absolute_error"]].round(6))
        order = ["without_external_sources", "with_four_sources"]
        fig, ax = plt.subplots(figsize=(9, 4.5))
        bars = ax.bar(["Без внешних источников", "Четыре источника"], summary.loc[order, "mae"], color=[BLUE, TEAL], width=0.5)
        ax.bar_label(bars, fmt="%.2f", padding=4)
        ax.set(ylim=(0, 160), ylabel="MAE, входов за час", title="Общая локальная проверка: ошибка снизилась на 11,23%")
        finish(fig, "11_external_sources_overall")
        """),
        markdown("""
        Open-Meteo, XMLCalendar, KudaGo и архив ДТП сравнивались с вариантом без внешних источников
        при одинаковых настройках. Оценены все доступные блоки исходной схемы: май–июнь,
        июль–август и сентябрь–октябрь, 39 744 маршрут-часа. Итог рассчитан по суммам ошибок,
        а не средним месячных score. OSM и дорожная эвристика исключены из обоих вариантов.
        Совместный выигрыш не устанавливает положительную пользу каждого источника отдельно.
        """),
        markdown("## 4. Устойчивость эффекта и индивидуальные абляции"),
        code("""
        scores = pd.read_csv(REPORTS / "champion/source_effects/scores.csv", sep=";")
        monthly = scores[scores.variant.eq("without_all_four") & scores.period.str.match(r"2025-\\d{2}$")].copy()
        individual = scores[scores.period.eq("all_six_months") & scores.variant.isin(["without_weather", "without_calendar", "without_events", "without_crashes"])].copy()
        fig, axes = plt.subplots(1, 2, figsize=(13, 4.8))
        month_bars = axes[0].bar(monthly.period.str[-2:], monthly.full_minus_variant, color=[TEAL if v >= 0 else ORANGE for v in monthly.full_minus_variant])
        axes[0].bar_label(month_bars, labels=[f"{v:+.5f}" for v in monthly.full_minus_variant], padding=3, fontsize=8)
        axes[0].margins(y=0.18)
        axes[0].axhline(0, color=BLUE, linewidth=0.8)
        axes[0].set(xlabel="Месяц 2025", ylabel="Изменение WAPE-score", title="Совместный эффект по месяцам")
        labels = {"without_weather": "Погода", "without_calendar": "Календарь", "without_events": "События", "without_crashes": "ДТП"}
        source_bars = axes[1].barh(individual.variant.map(labels), individual.full_minus_variant, color=[TEAL if v >= 0 else ORANGE for v in individual.full_minus_variant])
        axes[1].bar_label(source_bars, labels=[f"{v:+.6f}" for v in individual.full_minus_variant], padding=4, fontsize=9)
        axes[1].set_xlim(-0.0035, 0.022)
        axes[1].axvline(0, color=BLUE, linewidth=0.8)
        axes[1].set(xlabel="Полная модель − без источника, score", title="Индивидуальное отключение")
        finish(fig, "12_source_effect_stability")
        display(monthly[["period", "full_minus_variant"]])
        display(individual[["variant", "full_minus_variant"]])
        """),
        markdown("""
        Это вспомогательное сравнение сохраняет дорожную эвристику в обоих вариантах, поэтому его
        значения немного отличаются от строгого сравнения выше. Все месяцы показаны, включая
        ухудшения. Основной совместный эффект связан с календарём; отдельное удаление событий
        и ДТП немного улучшает результат. Статистическая значимость малых различий не установлена.

        Критерий хакатона выделяет категории «трафик», «погода», «календарь» и «прочие факторы».
        События и ДТП относятся к дополнительным факторам; четыре API не означают автоматического
        закрытия четырёх категорий. Измеренные дорожные заторы в данном артефакте отсутствуют.
        """),
        markdown("## 5. Признаки, используемые бустингом"),
        code("""
        importance = pd.read_csv(REPORTS / "champion/feature_importance.csv", sep=";")
        top = importance.sort_values("gain").tail(15)
        fig, ax = plt.subplots(figsize=(11, 6))
        ax.barh(top.feature, top.gain, color=BLUE)
        ax.set(xlabel="Суммарный gain LightGBM", title="15 признаков с наибольшим gain в финальном бустинге")
        finish(fig, "13_feature_importance")
        """),
        markdown("""
        Gain и число разбиений описывают использование признаков внутри деревьев, а не причинный
        вклад источников и не долю итогового прогноза. Сам бустинг имеет вес 2%; календарная
        поправка также действует в сезонной части. Коридоры неопределённости не показываются:
        они не откалиброваны для этого сохранённого артефакта.
        """),
        code("""
        result = {"hourly_mae": float(frame.absolute_error.mean()), "hourly_wape_score": float(score), "baseline_mae": float(frame.baseline_absolute_error.mean()), **daily_metrics}
        (REPORTS / "eda/notebook_metrics.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        display(pd.Series(result))
        """),
    ]
    save("02_validation_and_external_sources.ipynb", cells)


def main() -> None:
    data_notebook()
    validation_notebook()


if __name__ == "__main__":
    main()
