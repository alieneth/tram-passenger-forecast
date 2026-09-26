import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import { formatDecimal, formatHour } from '../../utils/format';
import { plural } from '../../utils/plural';
import type { ScenarioSummary } from '../../utils/scenario';
import { StatCard } from '../StatCard';

// Три итога сценария — из тех же точек, что и график, поэтому они не могут противоречить линии
export function ScenarioCards({ summary }: { summary: ScenarioSummary }) {
  const resolved = summary.hoursOverScenario === 0 && summary.hoursWithoutTrams.length === 0;
  return (
    <>
      <div className="stat-row stat-row--three">
        <StatCard
          icon={summary.hoursOverScenario > 0 ? 'warning' : 'check'}
          tone={summary.hoursOverScenario > 0 ? 'danger' : 'ok'}
          label="Часов выше нормы"
          value={`${summary.hoursOverBaseline} → ${summary.hoursOverScenario}`}
          note="прогноз → сценарий"
        />
        <StatCard
          icon="users"
          tone={
            summary.maxScenario !== null && summary.maxScenario > PASSENGERS_PER_TRAM_NORM
              ? 'danger'
              : 'default'
          }
          label="Максимум пассажиров на трамвай"
          value={`${formatDecimal(summary.maxBaseline)} → ${
            summary.maxScenario === null ? '—' : formatDecimal(summary.maxScenario)
          }`}
          note="прогноз → сценарий"
        />
        <StatCard
          icon={summary.reserveNeeded > 0 ? 'tram' : 'check'}
          tone={summary.reserveNeeded > 0 ? 'warning' : 'ok'}
          label="Нужно выходов из резерва"
          value={summary.reserveNeeded}
          note={
            summary.reserveNeeded > 0
              ? `чтобы в каждый час уложиться в норму — ещё ${summary.reserveNeeded} ${plural(summary.reserveNeeded, ['выход', 'выхода', 'выходов'])}`
              : 'при таком числе выходов норма соблюдается'
          }
        />
      </div>
      {summary.hoursWithoutTrams.length > 0 && (
        <p className="text-up">
          В часы {summary.hoursWithoutTrams.map((hour) => `${formatHour(hour)}:00`).join(', ')} на
          линии не останется трамваев — сценарий невыполним
        </p>
      )}
      {resolved && (
        <p className="muted">В сценарии пассажиров на трамвай не больше нормы весь день.</p>
      )}
    </>
  );
}
