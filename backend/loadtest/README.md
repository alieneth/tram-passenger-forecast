# Нагрузочный тест (OPS-2/OPS-3)

Результаты и методика — в корневом [`README.md`](../../README.md), раздел «Производительность».

```bash
docker compose up -d
docker run --rm --network tram-passenger-forecast_default --ulimit nofile=65536:65536 \
  -v "$(pwd)/backend/loadtest:/scripts" -e BASE_URL=http://backend:8080 \
  grafana/k6 run /scripts/scenario.js
```

`--ulimit nofile` — без него k6-контейнер на Windows/WSL2 быстрее упирается в лимит открытых файловых
дескрипторов при 200+ одновременных соединений.

`DB_POOL_SIZE` в `.env` (по умолчанию 30) — размер пула `spring.datasource.hikari.maximum-pool-size`,
подобран этим тестом (с 10 p95 был 370 мс, с 30 — 300 мс).
