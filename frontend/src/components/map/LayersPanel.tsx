export interface MapLayers {
  load: boolean;
  weather: boolean;
  events: boolean;
}

const LAYERS: { key: keyof MapLayers; label: string }[] = [
  { key: 'load', label: 'Пассажиропоток' },
  { key: 'weather', label: 'Погода' },
  { key: 'events', label: 'События' },
];

export function LayersPanel({
  layers,
  onChange,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
}) {
  return (
    <fieldset className="layers-panel">
      <legend className="layers-panel__title">Слои</legend>
      {LAYERS.map((layer) => (
        <label key={layer.key} className="toggle">
          <input
            type="checkbox"
            checked={layers[layer.key]}
            onChange={(event) => onChange({ ...layers, [layer.key]: event.target.checked })}
          />
          {layer.label}
        </label>
      ))}
      {/* В контракте нет метода со станциями метро и МЦК — слой включим, когда он появится */}
      <label className="toggle toggle--disabled" title="Нет данных в API: нужен метод со станциями">
        <input type="checkbox" disabled />
        Станции метро и МЦК
      </label>
    </fieldset>
  );
}
