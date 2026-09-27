"""Сводка других моделей, операционных объявлений и диагностической утечки."""

import json
import shutil
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from ml.experiments.operations import apply_operations
from ml.metrics import wape_score


def main() -> None:
    search = Path("ml/artifacts/alternative_search")
    operations = Path("ml/artifacts/alternative_operations")
    diagnostic = Path("ml/artifacts/target_proxy_diagnostic")
    output = Path("ml/reports/alternatives")
    output.mkdir(parents=True, exist_ok=True)
    op_scores = pd.read_csv(operations / "scores.csv", sep=";")
    selected = json.loads((operations / "selection.json").read_text())
    development = json.loads((search / "selection.json").read_text())["development"]
    proxy = pd.read_csv(diagnostic / "scores.csv", sep=";")
    control = pd.read_csv("ml/artifacts/qna_final/validation.csv", sep=";", parse_dates=["date"])
    corrected = apply_operations(control)
    control_score = wape_score(control.raw_boardings, control.prediction)
    corrected_score = wape_score(control.raw_boardings, corrected.prediction)
    family_rows = []
    for family in ("catboost", "extra_trees", "neural"):
        rows = op_scores[op_scores.family.eq(family) & op_scores.weight.gt(0)]
        pure = rows[rows.weight.eq(1)].sort_values("score", ascending=False).iloc[0]
        best = rows.sort_values("score_operations", ascending=False).iloc[0]
        family_rows.append(
            {
                "family": family,
                "best_pure": pure.score,
                "blended": best.score,
                "with_operations": best.score_operations,
                "mode": best["mode"],
                "target": best.target,
                "weight": best.weight,
            }
        )
    comparison = pd.DataFrame(family_rows)
    comparison.to_csv(output / "model_comparison.csv", sep=";", index=False)
    routes = []
    for route, rows in control.groupby("route"):
        updated = corrected.loc[rows.index]
        routes.append(
            {
                "route": route,
                "before": wape_score(rows.raw_boardings, rows.prediction),
                "after": wape_score(rows.raw_boardings, updated.prediction),
            }
        )
    pd.DataFrame(routes).to_csv(output / "operations_by_route.csv", sep=";", index=False)
    fig, ax = plt.subplots(figsize=(9, 5))
    comparison.set_index("family")[["best_pure", "blended", "with_operations"]].plot.bar(ax=ax)
    ax.set_ylabel("WAPE-score, September–October 2025")
    ax.set_xlabel("")
    ax.set_ylim(0, 1)
    ax.legend(["Pure model", "Profile blend", "Blend + operation rules"], loc="lower right")
    fig.tight_layout()
    fig.savefig(output / "model_comparison.png", dpi=160)
    plt.close(fig)
    lines = [
        "# Другие модели и официальные ограничения движения",
        "",
        "Сравнение альтернативных моделей. Выбранный платформенный результат: [0,88724](FINAL_DELIVERY.md).",
        "",
        "## Что проверено",
        "",
        "CatBoost (900 деревьев, depth=6, MAE): прямая цель, остаток относительно профиля, "
        "нормализованный остаток. ExtraTrees: 48 деревьев с absolute_error. "
        "Нейросеть MLP 64→32→1: Adam, 80 эпох, взвешенная MAE, NumPy. "
        "Три набора признаков: климатология; фактическая суточная погода; "
        "фактическая почасовая погода + ДТП + мероприятия. Шесть весов смешивания с профилем.",
        "",
        "Преобразование нормализованной цели: z=(y−profile)/scale, scale=max(profile,100), "
        "вес примера пропорционален scale. Поэтому scale×|z−z_hat| = |y−y_hat|: "
        "оптимизируется MAE в пассажирах. Log-target без компенсации весов не использовался.",
        "",
        "Первый временной срез: январь–июнь → июль–август; второй: январь–август → сентябрь–октябрь. "
        "Внутри обучения профили строятся по предшествующим двухмесячным блокам. "
        "Маршрут 5 не оценивается. Часы 01–04 исключены из обучения, прогноз нулевой; час 05 сохранён. "
        "Метрика таблиц — WAPE-score по исходным labels, без восстановления проверочного факта.",
        "",
        "## Результаты сентября–октября",
        "",
        "| Семейство | Лучший чистый регрессор | Смешивание с профилем | Смешивание + режим движения |",
        "|---|---:|---:|---:|",
    ]
    for row in comparison.itertuples(index=False):
        lines.append(
            f"| {row.family} | {row.best_pure:.6f} | {row.blended:.6f} | {row.with_operations:.6f} |"
        )
    lines += [
        "",
        "В строке чистый регрессор и смешивание могут иметь разные лучшие настройки. "
        "Выбор лучших настроек по сентябрю–октябрю — просмотренная валидация, не независимый тест.",
        "",
        f"Выбор только по июлю–августу: `{development['key']}`, вес {development['weight']}; "
        f"его результат сентября–октября без отмен: **{development['validation_score']:.6f}**.",
        "",
        f"Итоговый альтернативный кандидат: `{selected['key']}`, вес {selected['weight']}; "
        f"score до правил **{selected['score']:.6f}**, только с отменами №50 **{selected['score_closures']:.6f}**, "
        f"с отменами и сокращением №7 **{selected['score_operations']:.6f}**. "
        "Это модель плюс явное правило состояния маршрута. Результат этого CatBoost на платформе: **0,88506**; выбранный профиль + LightGBM с ограничениями получил **0,88724**.",
        "",
        "## Найденная причина провалов и новый внешний источник",
        "",
        "[Официальное сообщение от 5 сентября](https://t.me/DtOperativno/22624) объявляет отмену "
        "маршрута 50 по выходным с 6 сентября на время ремонта. "
        "[Сообщение от 15 ноября](https://t.me/DtOperativno/23565) подтверждает восстановление "
        "движения по выходным. Даты публикаций и SHA256 сохранены в `operational_sources.json`.",
        "",
        f"На неизменной модели Q&A применение этого правила даёт **{control_score:.6f} → {corrected_score:.6f}** "
        "на всей проверке сентября–октября. Это отдельный измеренный эффект информации о ремонте, "
        "а не выигрыш от смены алгоритма. Сами новости найдены после просмотра данных — "
        "поиск гипотез также может давать оптимистичную оценку.",
        "",
        "**Исправление прежней интерпретации:** четыре дня маршрута 50 (7, 14, 21, 27 сентября), "
        "которые ранее восстанавливались как возможные потери связи, совпадают с официальной отменой движения. "
        "В новом варианте они не восстанавливаются. При финальном обучении профиль нормальной работы "
        "строится без дней отмен, затем применяется маска движения. Исходные labels не изменены.",
        "",
        "Для №7 в те же выходные объявлена сокращённая трасса. Коэффициент снижения оценён "
        "взвешенной медианой отношения факта к прогнозу на 10 июля — 6 августа: "
        "[июльские работы и изменения маршрутов](https://transport.mos.ru/mostrans/all_news/125170). "
        f"Получено {selected['short_turn_factor']:.6f}; степень переноса {selected['short_turn_strength']} "
        "выбрана из 0, 0.25, 0.5, 0.75, 1 на просмотренной валидации. "
        "Июльская и осенняя трассы не идентичны: это проверенная здесь гипотеза переноса, "
        "а не известный из объявления процент снижения потока.",
        "",
        "Дата возобновления опубликована после 31 октября — здесь намеренно использована будущая "
        "внешняя информация. На ноябрь прогноз маршрута 50 зануляется 2, 8 и 9 ноября. "
        "Для рабочей субботы 1 ноября и праздничных 3–4 ноября нет отдельного подтверждения отмены: "
        "они оставлены рабочими в этой маске. Это ограничение интерпретации объявления, а не установленный факт расписания.",
        "",
        "## Почему не вся утечка даёт большой прирост",
        "",
        "Будущая погода, ДТП и события не содержат точного количества посадок; "
        "они могут объяснять лишь небольшую долю ошибки. Отмена конкретного маршрута имеет "
        "значительно более прямую связь с целью. Отдельно выполнена диагностика признаков из "
        "успешных валидаций самого предсказываемого часа:",
        "",
        "| Диагностический вариант | WAPE-score |",
        "|---|---:|",
    ]
    for row in proxy.itertuples(index=False):
        lines.append(f"| {row.variant} | {row.score:.6f} |")
    lines += [
        "",
        "Это CatBoost normalized, 500 деревьев, без смешивания. Число наблюдаемых выходов "
        "и интервал между валидациями вычисляются из тех же событий, что и boardings. "
        "Это зависимые от цели признаки, а не независимый внешний источник. "
        "На ноябрь–декабрь их нет, поэтому они **не включены в сабмит**, а их качество "
        "не заявляется как качество доступного двухмесячного прогноза.",
        "",
        "## Артефакты и повторение",
        "",
        "`ml/artifacts/alternative_operations/`: модель, выбранный `test_submission.csv`, "
        "почасовые и суточные строки `forecast.csv`, предсказания валидации, SHA256. "
        "День — по часам, неделя/месяц — по дням; интервалы эмпирические, номинал 80%. "
        "Годовой горизонт не реализован. Предыдущий финальный сабмит не перезаписан.",
        "",
        "```powershell",
        "python -m pip install -r ml/requirements-experiments.txt",
        "python -m ml.experiments.alternative_search --data PATH_TO_DATA --cache PATH_TO_CACHE",
        "python -m ml.experiments.target_proxy_diagnostic --features ml/artifacts/alternative_search/features_validation_climatology.joblib --raw PATH_TO_HOURLY_VALIDATIONS --output ml/artifacts/target_proxy_diagnostic",
        "python -m ml.experiments.alternative_delivery --data PATH_TO_DATA --cache PATH_TO_CACHE",
        "python -m ml.experiments.alternative_report",
        "```",
        "",
        "Для запуска нужны входы предшествующего oracle-эксперимента, его исходный кэш "
        "и выпуск ml.qna (development_night_zero.csv для июльской калибровки). "
        "`--resume` продолжает только тот же прерванный поиск с неизменными входами и настройками.",
        "",
        "![Сравнение моделей](reports/alternatives/model_comparison.png)",
    ]
    Path("ml/ALTERNATIVE_MODELS_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for src, name in [
        (search / "scores.csv", "all_scores.csv"),
        (operations / "scores.csv", "operation_scores.csv"),
        (operations / "selection.json", "selection.json"),
        (diagnostic / "scores.csv", "target_proxy_scores.csv"),
        (Path("ml/artifacts/operational_sources/provenance.json"), "operational_sources.json"),
    ]:
        shutil.copy2(src, output / name)


if __name__ == "__main__":
    main()
