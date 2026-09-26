# data

Сюда кладём датасет организаторов локально. **В git не попадает** (см. `.gitignore`), кроме этого файла.

Ожидаемая структура:

```
data/
├── train.csv            # валидации янв–авг 2025, 49 051 926 строк, разделитель ;
├── test.csv             # валидации сен–окт 2025, 13 391 571 строка
├── test_submission.csv  # шаблон ответа: route;date;hour;prediction (ноя–дек 2025)
├── labels/
│   ├── labels_day_train.csv   # route;date;hour;boardings
│   └── labels_day_test.csv
└── spravochniki/
    ├── Хакатон_справочники_трамвай_10_маршрутов.xlsx
    └── Хакатон_пример_валидаций.xlsx
```

Внешние данные (календарь, погода, OpenStreetMap) — в `data/external/`, тоже вне git.
