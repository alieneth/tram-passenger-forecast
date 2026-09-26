import { useDecisionLog } from '../../hooks/useDecisions';
import { formatDate } from '../../utils/dates';
import { formatInterval } from '../../utils/decisions';
import { EmptyState } from '../states/EmptyState';

// Журнал действий диспетчера. В контракте нет метода чтения decision_log — показываем то, что
// вернул PATCH в этой сессии, и честно об этом пишем
export function DecisionJournal() {
  const log = useDecisionLog();
  return (
    <div className="journal">
      {log.length === 0 ? (
        <EmptyState message="В этой сессии решений ещё не принимали" />
      ) : (
        <ol className="journal__list">
          {log.map(({ result, decision }) => (
            <li
              key={`${result.decision_id}-${result.changed_at}-${result.status_code}`}
              className="journal__entry"
            >
              <span
                className={`journal__dot journal__dot--${result.status_code}`}
                aria-hidden="true"
              />
              <span className="journal__time">
                {formatDate(result.changed_at.slice(0, 10))} {result.changed_at.slice(11, 16)}
              </span>
              <span>
                <strong>{result.status_name}</strong> · маршрут {decision.route},{' '}
                {formatInterval(decision)}
                {decision.parent_decision_id != null && ' (запасной вариант)'}
              </span>
              {result.reason && <span className="muted">Причина: {result.reason}</span>}
              <span className="muted">{result.changed_by}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="muted journal__note">
        Показаны действия этой сессии. Полный журнал появится, когда в API будет метод чтения
        журнала решений.
      </p>
    </div>
  );
}
