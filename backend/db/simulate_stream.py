"""Скрипт-имитатор потокового приёма (CLAUDE.md раздел 7): "у нас — эндпоинт + скрипт-имитатор
из истории". Проигрывает train.csv/test.csv пачками на POST /api/v1/validations, как будто данные
идут с валидаторов в реальном времени, а не одним пакетным файлом.

Запуск:
python backend/db/simulate_stream.py --source data/train.csv --batch-size 200 --delay 1 --limit 5000
"""

import argparse
import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

ROUTE_PATTERN = re.compile(r"\d+")


def parse_route(ngpt_route: str | None) -> int | None:
    if not ngpt_route:
        return None
    match = ROUTE_PATTERN.search(ngpt_route)
    return int(match.group()) if match else None


def to_record(row: dict) -> dict | None:
    route = parse_route(row.get("ngpt_route"))
    if route is None:
        return None
    record = {
        "tran_no": int(row["tran_no"]),
        "device_no": int(row["device_no"]),
        # Контракт ждёт OffsetDateTime — в данных время московское без пояса (CLAUDE.md раздел 5),
        # дописываем фиксированное +03:00 (Россия без перехода на летнее время).
        "tran_date_time": row["tran_date_time"].replace(" ", "T") + "+03:00",
        "crd_hashcode": row["crd_hashcode"],
        "validation_result": int(row["validation_result"]),
        "route": route,
    }
    if row.get("begin_date_time"):
        record["begin_date_time"] = row["begin_date_time"].replace(" ", "T") + "+03:00"
    if row.get("tran_type_id"):
        record["tran_type_id"] = int(row["tran_type_id"])
    if row.get("good_type"):
        record["good_type"] = row["good_type"]
    if row.get("pass_route"):
        record["pass_route"] = row["pass_route"]
    if row.get("bus_exit_no"):
        record["bus_exit_no"] = int(row["bus_exit_no"])
    if row.get("garage_number"):
        record["garage_number"] = int(row["garage_number"])
    return record


def send_batch(url: str, token: str, items: list[dict]) -> dict:
    body = json.dumps({"items": items}).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{error.code} {error.reason}: {error.read().decode('utf-8')}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="data/train.csv")
    parser.add_argument(
        "--url", default=os.environ.get("API_URL", "http://localhost:8080/api/v1/validations")
    )
    parser.add_argument("--token", default=os.environ.get("AUTH_INGEST_TOKEN", "change_me_ingest"))
    parser.add_argument("--batch-size", type=int, default=200, help="Записей в одной пачке (контракт: до 5000)")
    parser.add_argument("--delay", type=float, default=1.0, help="Пауза между пачками, секунды")
    parser.add_argument("--limit", type=int, default=5000, help="Максимум записей всего (0 = без ограничения)")
    args = parser.parse_args()

    sent = 0
    batch: list[dict] = []
    with open(args.source, encoding="utf-8", newline="") as source_file:
        reader = csv.DictReader(source_file, delimiter=";")
        for row in reader:
            record = to_record(row)
            if record is None:
                continue
            batch.append(record)
            if len(batch) >= args.batch_size:
                result = send_batch(args.url, args.token, batch)
                sent += result["accepted"]
                print(
                    f"accepted={result['accepted']} rejected={result['rejected']} всего={sent}"
                )
                batch = []
                if args.limit and sent >= args.limit:
                    break
                time.sleep(args.delay)

    if batch and (not args.limit or sent < args.limit):
        result = send_batch(args.url, args.token, batch)
        sent += result["accepted"]
        print(f"accepted={result['accepted']} rejected={result['rejected']} всего={sent} (остаток)")

    print(f"Готово. Всего принято потоком: {sent}")


if __name__ == "__main__":
    main()
