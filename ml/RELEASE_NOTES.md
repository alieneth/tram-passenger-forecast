Полный пакет выбранной ML-версии с платформенным WAPE-score **0,88724**.

Скачайте `ml_platform_088724.zip` и распакуйте в `ml/artifacts/platform_final/`.
Архив содержит forecast.csv, model_quality.csv, bundle.joblib, model_version.json,
manifest.json, точный test_submission.csv, интервалы, вклад ограничений движения,
валидацию, метрики и происхождение данных. Файлы также приложены отдельно.

```bash
python -m pip install -r ml/requirements.txt
python -m ml.final_package verify
```

Без архива тот же пакет собирается командой:

```bash
python -m ml.final_package build --download
```

Схема DDL и команды PostgreSQL описаны в MODEL_CARD.md.
При сохранении версия неактивна по умолчанию; активация — отдельный флаг.
Ни переобучение, ни готовый CSV как вход модели для воспроизведения не нужны.

SHA256 конкурсного CSV: `c725598b623ae64d7f8979a11c208efcb51f4ae6919c8c2caa40a712ec4b11bd`.
Score сообщён платформой, скрытые метки отсутствуют.
Текущая модель сохраняет исходные веса; ночные прогнозы занулены после инференса.
Использована ретроспективная информация о возобновлении движения.
Для закрытого Release задайте GH_TOKEN/GITHUB_TOKEN; без него доступна публичная
копия тех же весов с проверкой SHA256. Детальные ограничения — MODEL_CARD.md.
