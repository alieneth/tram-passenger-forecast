import { useEffect, useState } from 'react';

const COPIED_FEEDBACK_MS = 1500;

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };

  const labels = { idle: 'Копировать', copied: 'Скопировано', failed: 'Не удалось скопировать' };
  return (
    <button type="button" className="button button--small" onClick={copy}>
      {labels[state]}
    </button>
  );
}
