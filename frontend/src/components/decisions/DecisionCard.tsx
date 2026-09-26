import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, type Decision, type DecisionStatusUpdate } from '../../api';
import { useUpdateDecision } from '../../hooks/useDecisions';
import {
  deadlineTime,
  effectText,
  isWaiting,
  problemText,
  proposalText,
} from '../../utils/decisions';
import { formatDecimal } from '../../utils/format';
import { Icon } from '../Icon';
import { ErrorState } from '../states/ErrorState';

interface DecisionCardProps {
  decision: Decision;
  alternatives: Decision[];
}

type TargetStatus = DecisionStatusUpdate['status_code'];
// Статусы, для которых причина обязательна (контракт PATCH /decisions/{id})
type ReasonStatus = Extract<TargetStatus, 'rejected' | 'not_executed'>;

// Карточка решения: проблема → предложение → эффект → действие (экран 1в)
export function DecisionCard({ decision, alternatives }: DecisionCardProps) {
  const update = useUpdateDecision();
  const [reasonFor, setReasonFor] = useState<ReasonStatus | null>(null);
  const [reason, setReason] = useState('');
  const waiting = isWaiting(decision);
  const stillOverNorm = decision.load_after > decision.norm;

  const change = (status: TargetStatus, withReason?: string) =>
    update.mutate(
      { decisionId: decision.decision_id, update: { status_code: status, reason: withReason } },
      {
        onSuccess: () => {
          setReasonFor(null);
          setReason('');
        },
      },
    );

  return (
    <article className={`decision${waiting ? ' decision--waiting' : ''}`}>
      <header className="decision__header">
        <span className="decision__icon" aria-hidden="true">
          <Icon name="warning" size={20} />
        </span>
        <strong>{problemText(decision)}</strong>
        <span className={`badge decision__status decision__status--${decision.status_code}`}>
          {decision.status_name}
        </span>
      </header>

      <p>
        <span className="decision__label">Проблема:</span> на {decision.excess_pct}% выше нормы{' '}
        {decision.norm} пасс. на трамвай
      </p>
      <p>
        <span className="decision__label">Предложение:</span> {proposalText(decision)}
      </p>
      <p>
        <span className="decision__label">Эффект:</span> {effectText(decision)}
        {stillOverNorm && <span className="text-up"> — всё ещё выше нормы</span>}
      </p>
      {/* Проверка бизнес-правила БП-08: переброска — только между маршрутами одного депо */}
      <p className={decision.same_depot ? 'decision__check' : 'decision__warn'}>
        <Icon name={decision.same_depot ? 'check' : 'warning'} size={14} />{' '}
        {decision.decision_type === 'transfer'
          ? decision.same_depot
            ? 'Оба маршрута обслуживает одно депо'
            : 'Маршруты из разных депо — переброска не допускается'
          : decision.same_depot
            ? 'Резерв депо маршрута'
            : 'Депо маршрута не указано в справочнике'}
      </p>
      {waiting && <p className="muted">Решить до {deadlineTime(decision)}</p>}

      {waiting && reasonFor === null && (
        <div className="decision__actions">
          <button
            type="button"
            className="button button--success"
            disabled={update.isPending}
            onClick={() => change('accepted')}
          >
            Принять
          </button>
          <button
            type="button"
            className="button"
            disabled={update.isPending}
            onClick={() => setReasonFor('rejected')}
          >
            Отклонить
          </button>
          <Link className="decision__link" to={`/what-if?decision=${decision.decision_id}`}>
            В симулятор →
          </Link>
        </div>
      )}
      {decision.status_code === 'accepted' && reasonFor === null && (
        <div className="decision__actions">
          <button
            type="button"
            className="button button--success"
            disabled={update.isPending}
            onClick={() => change('executed')}
          >
            Исполнено
          </button>
          <button
            type="button"
            className="button"
            disabled={update.isPending}
            onClick={() => setReasonFor('not_executed')}
          >
            Не исполнено
          </button>
        </div>
      )}
      {reasonFor && (
        <form
          className="decision__reason"
          onSubmit={(event) => {
            event.preventDefault();
            change(reasonFor, reason);
          }}
        >
          <label className="toolbar__field">
            <span className="header__label">
              Причина ({reasonFor === 'rejected' ? 'отклонение' : 'не исполнено'})
            </span>
            <textarea
              className="field field--textarea"
              value={reason}
              maxLength={500}
              required
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например: нет резерва в депо"
            />
          </label>
          <div className="decision__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={update.isPending || !reason.trim()}
            >
              Сохранить
            </button>
            <button type="button" className="button" onClick={() => setReasonFor(null)}>
              Отмена
            </button>
          </div>
        </form>
      )}
      {update.isError && <ErrorState message={errorMessage(update.error)} error={update.error} />}

      {alternatives.map((alternative, index) => (
        <AlternativeRow
          key={alternative.decision_id}
          number={index + 2}
          decision={alternative}
          onAccept={() =>
            update.mutate({
              decisionId: alternative.decision_id,
              update: { status_code: 'accepted' },
            })
          }
          disabled={update.isPending}
        />
      ))}
    </article>
  );
}

function AlternativeRow({
  number,
  decision,
  onAccept,
  disabled,
}: {
  number: number;
  decision: Decision;
  onAccept: () => void;
  disabled: boolean;
}) {
  return (
    <div className="decision__alternative">
      <span>
        Вариант {number}: {proposalText(decision)} · {formatDecimal(decision.load_after)} пасс. на
        трамвай
      </span>
      {isWaiting(decision) ? (
        <button
          type="button"
          className="button button--small"
          disabled={disabled}
          onClick={onAccept}
        >
          Принять вариант
        </button>
      ) : (
        <span className="badge">{decision.status_name}</span>
      )}
    </div>
  );
}
