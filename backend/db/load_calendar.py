"""Производственный календарь 2025 (CLAUDE.md раздел 9) в таблицу calendar_day.

Источник дней и переносов — xmlcalendar.ru (тот же, что уже проверен и используется моделью
Ярослава, см. ml/EXTERNAL_SOURCES_TABLE.md). Он не даёт названий праздников и школьных каникул —
названия праздников проставлены по фиксированному государственному календарю РФ (даты
законодательно не меняются год к году), школьные каникулы — только лето (июнь-август), это
единственный период, в котором уверен без отдельного проверенного источника.

Запуск: DATABASE_URL=postgresql://tram:change_me@localhost:5433/tram python backend/db/load_calendar.py
"""

import json
import os
import re
import urllib.request
from datetime import date, timedelta

import psycopg

YEAR = 2025

FIXED_HOLIDAY_NAMES = {
    (1, 1): "Новый год",
    (1, 2): "Новогодние каникулы",
    (1, 3): "Новогодние каникулы",
    (1, 4): "Новогодние каникулы",
    (1, 5): "Новогодние каникулы",
    (1, 6): "Новогодние каникулы",
    (1, 7): "Рождество Христово",
    (1, 8): "Новогодние каникулы",
    (2, 23): "День защитника Отечества",
    (3, 8): "Международный женский день",
    (5, 1): "Праздник Весны и Труда",
    (5, 9): "День Победы",
    (6, 12): "День России",
    (11, 4): "День народного единства",
}


def fetch_non_working_days(year: int) -> dict[date, dict]:
    url = f"https://xmlcalendar.ru/data/ru/{year}/calendar.json"
    with urllib.request.urlopen(url) as resp:
        data = json.load(resp)
    result: dict[date, dict] = {}
    for month_entry in data["months"]:
        month = month_entry["month"]
        for token in month_entry["days"].split(","):
            token = token.strip()
            if not token:
                continue
            match = re.match(r"(\d+)([*+]?)", token)
            day, marker = int(match.group(1)), match.group(2)
            day_date = date(year, month, day)
            if marker == "*":
                result[day_date] = {"day_type": "shortened", "holiday_name": None}
            else:
                is_weekend = day_date.weekday() >= 5
                result[day_date] = {
                    "day_type": "weekend" if is_weekend else "holiday",
                    "holiday_name": None if is_weekend else FIXED_HOLIDAY_NAMES.get((month, day)),
                }
    return result


def build_rows(year: int) -> list[dict]:
    non_working = fetch_non_working_days(year)
    rows = []
    current = date(year, 1, 1)
    end = date(year, 12, 31)
    while current <= end:
        info = non_working.get(current, {"day_type": "working", "holiday_name": None})
        rows.append(
            {
                "date": current,
                "day_of_week": current.isoweekday(),
                "day_type": info["day_type"],
                "holiday_name": info["holiday_name"],
                "is_school_holiday": current.month in (6, 7, 8),
            }
        )
        current += timedelta(days=1)
    return rows


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    rows = build_rows(YEAR)
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO calendar_day (date, day_of_week, day_type, holiday_name, is_school_holiday) "
            "VALUES (%(date)s, %(day_of_week)s, %(day_type)s, %(holiday_name)s, %(is_school_holiday)s) "
            "ON CONFLICT (date) DO UPDATE SET "
            "day_of_week = EXCLUDED.day_of_week, day_type = EXCLUDED.day_type, "
            "holiday_name = EXCLUDED.holiday_name, is_school_holiday = EXCLUDED.is_school_holiday",
            rows,
        )
        conn.commit()
    print(f"calendar_day: {len(rows)} строк")


if __name__ == "__main__":
    main()
