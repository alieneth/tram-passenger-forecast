"""Отмены движения из официальных объявлений; не подмена наблюдаемых посадок."""

import numpy as np
import pandas as pd

CLOSURE_START = pd.Timestamp("2025-09-06")
REOPENING = pd.Timestamp("2025-11-15")
CLOSURE_SOURCE = "https://t.me/DtOperativno/22624"
REOPENING_SOURCE = "https://t.me/DtOperativno/23565"
WORKING_SATURDAY = pd.Timestamp("2025-11-01")


def cancelled_service(frame: pd.DataFrame) -> pd.Series:
    """№50 отменён по выходным; переносы требуют отдельного уточнения расписания."""
    dates = pd.to_datetime(frame.date)
    # 1 ноября рабочий день: консервативно не переносим на него правило выходного.
    # 3–4 ноября не добавляем к отменам без отдельного подтверждения организатора движения.
    return (
        frame.route.eq(50)
        & dates.between(CLOSURE_START, REOPENING, inclusive="left")
        & dates.dt.dayofweek.ge(5)
        & dates.ne(WORKING_SATURDAY)
    )


def apply_operations(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    mask = cancelled_service(result)
    for column in ("prediction", "lower", "upper"):
        if column in result:
            result.loc[mask, column] = 0
    return result


def operating_history(history: pd.DataFrame) -> pd.DataFrame:
    """Профиль обычного движения оцениваем по дням работы; исходный факт сохраняется."""
    return history.loc[~cancelled_service(history)].copy()


def short_turn_mask(frame: pd.DataFrame) -> pd.Series:
    """В те же выходные №7 ходил до Каланчёвской улицы, а не по полной трассе."""
    return cancelled_service(frame.assign(route=50)) & frame.route.eq(7)


def learn_short_turn_factor(calibration: pd.DataFrame) -> float:
    """L1-коэффициент из июльского сокращения трассы, без меток сентября–октября."""
    dates = pd.to_datetime(calibration.date)
    sample = calibration[
        calibration.route.eq(7)
        & dates.between("2025-07-10", "2025-08-06")
        & calibration.prediction.gt(50)
    ]
    if sample.empty:
        raise ValueError("Нет июльской калибровки сокращённого маршрута")
    ratio = (sample.boardings / sample.prediction).to_numpy()
    weight = sample.prediction.to_numpy(dtype=float)
    order = np.argsort(ratio)
    index = np.searchsorted(np.cumsum(weight[order]), weight.sum() / 2)
    return float(np.clip(ratio[order][index], 0, 1))


def apply_short_turn(frame: pd.DataFrame, factor: float, strength: float) -> pd.DataFrame:
    if not 0 <= factor <= 1 or not 0 <= strength <= 1:
        raise ValueError("Коэффициент и степень переноса должны быть в [0,1]")
    result = frame.copy()
    mask = short_turn_mask(result)
    for name in ("prediction", "lower", "upper"):
        if name in result:
            result.loc[mask, name] = np.rint(
                result.loc[mask, name] * (1 + strength * (factor - 1))
            ).astype("int64")
    return result
