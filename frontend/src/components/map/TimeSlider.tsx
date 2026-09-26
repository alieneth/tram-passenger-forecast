import { DISPLAY_HOURS, PLAYBACK_SPEEDS } from '../../config/constants';
import { formatHour, formatHourTime } from '../../utils/format';

interface TimeSliderProps {
  hour: number;
  onHourChange: (hour: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

// Шкала 05:00 … 23:00, 00:00 — без «24» и без повторов
export function TimeSlider({
  hour,
  onHourChange,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
}: TimeSliderProps) {
  const index = Math.max(0, DISPLAY_HOURS.indexOf(hour));
  return (
    <div className="time-slider">
      <button type="button" className="button button--primary" onClick={onTogglePlay}>
        {playing ? '❚❚ Пауза' : '▶ Проиграть день'}
      </button>
      <span className="time-slider__current" aria-live="polite">
        {formatHourTime(hour)}
      </span>
      <label className="time-slider__speed">
        Скорость
        <select
          className="field"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        >
          {PLAYBACK_SPEEDS.map((value) => (
            <option key={value} value={value}>
              ×{value}
            </option>
          ))}
        </select>
      </label>
      <div className="time-slider__track">
        <input
          type="range"
          min={0}
          max={DISPLAY_HOURS.length - 1}
          step={1}
          value={index}
          aria-label="Час прогноза"
          aria-valuetext={formatHourTime(hour)}
          onChange={(event) => onHourChange(DISPLAY_HOURS[Number(event.target.value)] ?? hour)}
        />
        <div className="time-slider__ticks" aria-hidden="true">
          {DISPLAY_HOURS.map((item) => (
            <span key={item} className={item === hour ? 'time-slider__tick--active' : undefined}>
              {formatHour(item)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
