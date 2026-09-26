import type { RouteGeometry, Stop } from '../../api/types';

// Первые две остановки маршрута 1 — из примера контракта, остальные координаты УСЛОВНЫЕ:
// нужны только чтобы нарисовать линии в мок-режиме. Реальные трассы придут из справочника через API.
// Для 17, 25, 26, 28, 50 трасс нет — мок, как и API, отвечает 404 GEOMETRY_NOT_FOUND.

type Point = [name: string, lat: number, lon: number];

const MOCK_STOP_ID_BASE = 900_000;

function buildStops(route: number, points: Point[]): Stop[] {
  return points.map(([stop_name, stop_lat, stop_lon], index) => ({
    stop_sequence: index + 1,
    stop_id: MOCK_STOP_ID_BASE + route * 100 + index,
    stop_name,
    stop_lat,
    stop_lon,
  }));
}

// Направление 1 — те же остановки в обратном порядке
function buildGeometry(
  route: number,
  routeLongName: string | null,
  points: Point[],
): RouteGeometry {
  const forward = buildStops(route, points);
  const backward = [...forward]
    .reverse()
    .map((stop, index) => ({ ...stop, stop_sequence: index + 1 }));
  return {
    route,
    route_long_name: routeLongName,
    directions: [
      { direction_id: 0, stops: forward },
      { direction_id: 1, stops: backward },
    ],
  };
}

export const geometryMock: Record<number, RouteGeometry> = {
  1: buildGeometry(1, 'Чертаново Южное - Москворецкий рынок', [
    ['Чертаново Южное', 55.59468, 37.590884],
    ['Поликлиника', 55.598721, 37.588526],
    ['Остановка 3', 55.6121, 37.5953],
    ['Остановка 4', 55.6264, 37.6048],
    ['Остановка 5', 55.6398, 37.6177],
    ['Москворецкий рынок', 55.6512, 37.6334],
  ]),
  5: buildGeometry(5, 'Метро "Рижская" - Белорусский вокзал', [
    ['Метро "Рижская"', 55.7925, 37.6363],
    ['Остановка 2', 55.7938, 37.6158],
    ['Остановка 3', 55.7937, 37.5885],
    ['Остановка 4', 55.7851, 37.5846],
    ['Белорусский вокзал', 55.7766, 37.5817],
  ]),
  7: buildGeometry(7, null, [
    ['Остановка 1', 55.7896, 37.6799],
    ['Остановка 2', 55.7812, 37.6931],
    ['Остановка 3', 55.7724, 37.7054],
    ['Остановка 4', 55.7638, 37.7198],
    ['Остановка 5', 55.7561, 37.7342],
  ]),
  11: buildGeometry(11, null, [
    ['Остановка 1', 55.7302, 37.6601],
    ['Остановка 2', 55.7228, 37.6743],
    ['Остановка 3', 55.7147, 37.6902],
    ['Остановка 4', 55.7069, 37.7055],
    ['Остановка 5', 55.6991, 37.7213],
  ]),
  12: buildGeometry(12, null, [
    ['Остановка 1', 55.8004, 37.5012],
    ['Остановка 2', 55.8083, 37.4895],
    ['Остановка 3', 55.8162, 37.4781],
    ['Остановка 4', 55.8241, 37.4668],
    ['Остановка 5', 55.8317, 37.4553],
  ]),
};
