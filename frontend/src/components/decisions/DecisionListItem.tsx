import type { Decision } from '../../api';
import { deadlineTime, formatInterval, isWaiting } from '../../utils/decisions';
import { formatDecimal } from '../../utils/format';
import { Icon } from '../Icon';
import { DecisionDetails } from './DecisionDetails';

interface DecisionListItemProps {
  decision: Decision;
  alternatives: Decision[];
  expanded: boolean;
  onToggle: () => void;
}

// Строка списка решений: «Маршрут 17 · 17:00–19:00 · 167 пасс. на трамвай», раскрывается по клику
export function DecisionListItem({
  decision,
  alternatives,
  expanded,
  onToggle,
}: DecisionListItemProps) {
  const waiting = isWaiting(decision);
  const detailsId = `decision-${decision.decision_id}`;
  return (
    <li className={`decision-item${waiting ? ' decision-item--waiting' : ''}`}>
      <button
        type="button"
        className="decision-item__summary"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="decision-item__icon" aria-hidden="true">
          <Icon name="warning" size={20} />
        </span>
        <span className="decision-item__title">
          <strong>Маршрут {decision.route}</strong> · {formatInterval(decision)} ·{' '}
          {formatDecimal(decision.load_before)} пасс. на трамвай
          <span className="decision-item__excess">
            {' '}
            (+{decision.excess_pct}% к норме {decision.norm})
          </span>
        </span>
        {waiting && <span className="muted">до {deadlineTime(decision)}</span>}
        <span className={`badge decision__status decision__status--${decision.status_code}`}>
          {decision.status_name}
        </span>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      {expanded && (
        <div id={detailsId} className="decision-item__body">
          <DecisionDetails decision={decision} alternatives={alternatives} />
        </div>
      )}
    </li>
  );
}
