// Нагрузочный тест API (OPS-2/OPS-3, CLAUDE.md раздел 7): сотни RPS, p95 < 200-300 мс.
// Смесь запросов близка к реальному использованию диспетчером: прогноз и факт — чаще всего,
// справочники и health — реже. Запуск: см. backend/loadtest/README.md.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://backend:8080';
const ROUTES = [1, 7, 11, 12, 17, 25, 26, 28, 50];

export const options = {
  scenarios: {
    ramping: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '40s', target: 150 },
        { duration: '40s', target: 300 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

function pickRoute() {
  return ROUTES[Math.floor(Math.random() * ROUTES.length)];
}

export default function () {
  const scenario = Math.random();
  const route = pickRoute();

  if (scenario < 0.4) {
    const res = http.get(`${BASE_URL}/api/v1/forecast?route=${route}&date_from=2025-11-14&horizon=day`);
    check(res, { 'forecast 200': (r) => r.status === 200 });
  } else if (scenario < 0.6) {
    const res = http.get(
      `${BASE_URL}/api/v1/actuals?route=${route}&date_from=2025-09-01&date_to=2025-09-07`,
    );
    check(res, { 'actuals 200': (r) => r.status === 200 });
  } else if (scenario < 0.8) {
    const res = http.get(`${BASE_URL}/api/v1/routes`);
    check(res, { 'routes 200': (r) => r.status === 200 });
  } else if (scenario < 0.95) {
    const res = http.get(`${BASE_URL}/api/v1/routes/${route}/geometry`);
    check(res, { 'geometry ok': (r) => r.status === 200 || r.status === 404 });
  } else {
    const res = http.get(`${BASE_URL}/api/v1/health`);
    check(res, { 'health 200': (r) => r.status === 200 });
  }

  sleep(0.1);
}
