import { useEffect, useState } from 'react';
import { PLAYBACK_HOUR_MS } from '../config/constants';

// «Проиграть день»: идём по часам шкалы с заданной скоростью и останавливаемся на последнем
export function usePlayback(hours: readonly number[], initialHour: number) {
  const [hour, setHour] = useState(initialHour);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setHour((current) => {
        const next = hours[hours.indexOf(current) + 1];
        if (next === undefined) {
          setPlaying(false);
          return current;
        }
        return next;
      });
    }, PLAYBACK_HOUR_MS / speed);
    return () => clearInterval(timer);
  }, [playing, speed, hours]);

  const togglePlay = () => {
    // С последнего часа проигрываем день заново
    if (!playing && hour === hours.at(-1)) setHour(hours[0] ?? initialHour);
    setPlaying(!playing);
  };

  return { hour, setHour, playing, togglePlay, speed, setSpeed };
}
