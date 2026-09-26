import { Link } from 'react-router';
import { EmptyState } from '../components/states/EmptyState';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState message="Такой страницы нет" />
      <Link className="button" to="/">
        На обзор
      </Link>
    </div>
  );
}
