import { Panel } from '../components/Panel';
import type { Wave } from '../config/navigation';

export function PlaceholderPage({ title, wave }: { title: string; wave: Wave }) {
  return (
    <div className="page">
      <Panel title={title}>
        <div className="map-placeholder">Экран появится в волне {wave}</div>
      </Panel>
    </div>
  );
}
