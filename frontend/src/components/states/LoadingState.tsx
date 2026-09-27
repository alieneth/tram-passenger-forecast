export function LoadingState({ text = 'Загружаем данные…' }: { text?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}
