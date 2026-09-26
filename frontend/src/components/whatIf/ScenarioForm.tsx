import type { Route } from '../../api';
import { NO_DATA_LABEL } from '../../config/constants';
import { HOUR_INTERVALS } from '../../config/intervals';
import type { ScenarioState } from '../../hooks/useScenarioParams';
import { formatHour } from '../../utils/format';
import { hasNoData } from '../../utils/routes';
import type { Corrections } from '../../utils/scenario';
import { CorrectionSliders } from './CorrectionSliders';

interface ScenarioFormProps {
  routes: Route[];
  route: number;
  state: ScenarioState;
  // Выходов на линии в пик по прогнозу — точка отсчёта для «+» и «−»
  basePeakTrams: number;
  onRouteChange: (route: number) => void;
  onIntervalChange: (id: string) => void;
  onDeltaChange: (delta: number) => void;
  onCorrectionChange: (key: keyof Corrections, pct: number) => void;
  onReset: () => void;
}

export function ScenarioForm({
  routes,
  route,
  state,
  basePeakTrams,
  onRouteChange,
  onIntervalChange,
  onDeltaChange,
  onCorrectionChange,
  onReset,
}: ScenarioFormProps) {
  const changed =
    state.tramsDelta !== 0 || Object.values(state.correctionsPct).some((pct) => pct !== 0);
  const exits = basePeakTrams + state.tramsDelta;
  return (
    <form className="scenario-form" onSubmit={(event) => event.preventDefault()}>
      <label className="toolbar__field">
        <span className="header__label">Маршрут</span>
        <select
          className="field"
          value={route}
          onChange={(event) => onRouteChange(Number(event.target.value))}
        >
          {routes.map((item) => (
            <option key={item.route} value={item.route}>
              Маршрут {item.route}
              {hasNoData(item) ? ` — ${NO_DATA_LABEL}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="toolbar__field">
        <span className="header__label">Часы, где меняем выходы</span>
        <select
          className="field"
          value={state.intervalId}
          onChange={(event) => onIntervalChange(event.target.value)}
        >
          {HOUR_INTERVALS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id === 'all' ? `Весь день, ${item.label}` : item.label}
            </option>
          ))}
          {state.customInterval && (
            <option value="custom">
              Из решения: {formatHour(state.customInterval.from)}:00–
              {formatHour((state.customInterval.to + 1) % 24)}:00
            </option>
          )}
        </select>
      </label>

      <div className="toolbar__field">
        <span className="header__label">Выходов на линии в пик</span>
        <div className="stepper">
          <button
            type="button"
            className="button stepper__button"
            aria-label="Снять выход"
            // Хотя бы один трамвай в пик должен остаться
            disabled={exits <= 1}
            onClick={() => onDeltaChange(state.tramsDelta - 1)}
          >
            −
          </button>
          <output className="stepper__value" aria-live="polite">
            {exits}
          </output>
          <button
            type="button"
            className="button stepper__button"
            aria-label="Добавить выход"
            onClick={() => onDeltaChange(state.tramsDelta + 1)}
          >
            +
          </button>
        </div>
        <span className="muted">
          по прогнозу — {basePeakTrams}
          {state.tramsDelta !== 0 &&
            `, изменение ${state.tramsDelta > 0 ? '+' : ''}${state.tramsDelta}`}
        </span>
      </div>

      <CorrectionSliders valuesPct={state.correctionsPct} onChange={onCorrectionChange} />

      <button type="button" className="button" disabled={!changed} onClick={onReset}>
        Сбросить
      </button>
    </form>
  );
}
