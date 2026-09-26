import type { Route } from '../../api';
import { NEW_ROUTE_LABEL } from '../../config/constants';
import { HOUR_INTERVALS } from '../../config/intervals';
import type { ScenarioState } from '../../hooks/useScenarioParams';
import { formatHour } from '../../utils/format';

interface ScenarioFormProps {
  routes: Route[];
  route: number;
  state: ScenarioState;
  // Выходов на линии в пик по прогнозу — точка отсчёта для «+» и «−»
  basePeakTrams: number;
  onRouteChange: (route: number) => void;
  onIntervalChange: (id: string) => void;
  onDeltaChange: (delta: number) => void;
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
  onReset,
}: ScenarioFormProps) {
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
              {item.is_new ? ` — ${NEW_ROUTE_LABEL}` : ''}
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

      {/* Погода, тип дня и событие меняют сам поток — это пересчёт моделью, а в API такого метода нет */}
      <fieldset className="scenario-form__model" disabled>
        <legend className="header__label">Погода, тип дня, событие</legend>
        <select className="field" aria-label="Погода">
          <option>По прогнозу</option>
        </select>
        <select className="field" aria-label="Тип дня">
          <option>По календарю</option>
        </select>
        <select className="field" aria-label="Событие">
          <option>Без изменений</option>
        </select>
        <span className="muted">
          Для этих параметров нужен пересчёт прогноза моделью — появится, когда в API будет метод
          сценария
        </span>
      </fieldset>

      <button type="button" className="button" disabled={state.tramsDelta === 0} onClick={onReset}>
        Сбросить
      </button>
    </form>
  );
}
