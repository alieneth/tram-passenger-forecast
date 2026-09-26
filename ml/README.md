# ML: зафиксированный победитель по результату платформы

Именно модель исходного `artifacts/submission.csv`: **около 0,88 на платформе по сообщению Ярослава**, локальный WAPE-score **0,8920614645**. Это не новый результат платформы. Позднейшая версия с результатом 0,77 и исследовательские кандидаты сюда не включены.

98% сезонного медианного профиля + 2% LightGBM с L1-loss. Финальная история — январь–октябрь 2025, прогноз — ноябрь–декабрь. Перенос в `ml/` проверяется на равенство каждого из 14 640 прогнозов. SHA256 исходного Windows-файла: `0fcac1502fa3423e51d784bf731a2526e18f5b3d2d58c21d7776be06eee6942f`. GitHub хранит CSV с LF, хеш этой копии указан в manifest; значения совпадают.

**№5 остаётся нулевым.** Это сохранение лучшего проверенного сабмита по последнему указанию Ярослава, а не утверждение, что маршрут не работает. Требование приложения «№5 работает весь период, прогноз по аналогам» этим выпуском **не закрыто**. Не активировать как готовую модель приложения без адаптации.

## Запуск

Из корня командного репозитория, Python 3.11+; точное воспроизведение проверено на Python 3.12 с закреплёнными зависимостями.

```bash
python -m venv .venv
# Активируйте .venv средствами своей ОС.
python -m pip install -r ml/requirements.txt
python -m ml.champion download
python -m ml.champion verify
python -m ml.champion predict
```

Для платформы: `ml/artifacts/champion/test_submission.csv`. Формат `route;date;hour;prediction`, UTF-8, все часы 10 маршрутов, 14 640 строк. Исходный файл без пересчёта: `ml/artifacts/champion/submission.csv`.

Артефакты вне этого git: [сабмит](https://raw.githubusercontent.com/IvanCot/ml_solution/163eb36c876d789daed624d017ee5873649cc10d/artifacts/submission.csv), [bundle](https://raw.githubusercontent.com/IvanCot/ml_solution/163eb36c876d789daed624d017ee5873649cc10d/artifacts/bundle.joblib), [метрики](https://raw.githubusercontent.com/IvanCot/ml_solution/163eb36c876d789daed624d017ee5873649cc10d/artifacts/metrics.json). Загрузчик закрепляет коммит и проверяет SHA256 **до** чтения pickle. Для офлайн-запуска скопируйте эти файлы в `ml/artifacts/champion/`. Переменная `ML_CHAMPION_DIR` меняет каталог. Raw для инференса не нужны; сеть — только при скачивании артефактов.

```bash
python -m ml.champion predict --start 2025-11-14 --end 2025-11-14 --output ml/artifacts/day.csv
python -m ruff check ml
python -m ruff format --check ml
python -m pytest ml/tests -q
```

Произвольный день внутри горизонта — срез двухмесячного расчёта с климатической нормой, **не новый day-ahead прогноз погоды**. Суммы по дням/месяцам получаются через pandas groupby; их качество не подменяет почасовую метрику.

## Обучение, baseline и аудит

Данные: `data/train.csv`, `data/test.csv`, `data/labels/labels_day_train.csv`, `data/labels/labels_day_test.csv`, `data/test_submission.csv`. Большие raw обрабатываются DuckDB с лимитом памяти, обучение — по компактным labels. Настройки: [`.env.example`](.env.example).

```bash
python -m ml.audit_raw
python -m ml.data_audit
python -m ml.baseline
python -m ml.champion train --online --output ml/artifacts/champion_retrained
```

Baseline — среднее route × день недели × час. `train` оценивает baseline и модель, затем переобучает на январе–октябре; эталон не заменяет. JSON кэшируются, ДТП скачиваются ZIP. Повторная загрузка изменяемых карточек событий может изменить результат. **Точное воспроизведение гарантирует сохранённый bundle, а не новое скачивание источников**. Для идентичного обучения нужны исторический кэш и то же окружение. Сентябрь–октябрь использовался при разработке, это не независимый тест.

[EDA](DATA_QUALITY.md): полный проход 62 443 497 строк, пропуски, типы, дубли, хвосты дат, сверка labels, аномалии. [Численные результаты](reports/data_quality/report.json) приложены; сырые транзакции и хеши карт в git не включены.

## Передача команде

[Анализ именно этой модели](MODEL_ANALYSIS.md), [архитектура и ОДЗ](ARCHITECTURE.md), [источники, утечки и критерии](CRITERIA_REPORT.md).

`ml.postgres` и `ml.postgres_aux` — адаптеры командных таблиц model_version, forecast и вспомогательных таблиц. Схему создаёт командный SQL; Java читает заранее рассчитанные прогнозы.

У этого чемпиона **пока нет откалиброванных lower/upper, ненулевого №5 и полного набора вспомогательных таблиц для приложения**. Адаптер принимает подготовленные корректные таблицы, интервалы не выдумывает. Живая БД не проверена, команды чемпиона БД не изменяют. Для приложения адаптацию необходимо завершить; конкурсный CSV готов и воспроизводится без БД.
