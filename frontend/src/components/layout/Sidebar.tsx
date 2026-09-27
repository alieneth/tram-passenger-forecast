import { NavLink } from 'react-router';
import { NAV_ITEMS } from '../../config/navigation';
import { Icon } from '../Icon';

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Разделы">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
