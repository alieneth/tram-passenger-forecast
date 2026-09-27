import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// Ошибка отрисовки экрана не должна давать пустую страницу: показываем сообщение и путь назад.
// Сбрасывается при переходе на другой экран (ключ — адрес, см. AppLayout).
// Саму ошибку React выводит в консоль разработчика
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <ErrorState
          message="Не удалось показать экран. Обновите страницу или вернитесь на обзор"
          onRetry={() => window.location.reload()}
        />
        <Link className="button" to="/">
          На обзор
        </Link>
      </div>
    );
  }
}
