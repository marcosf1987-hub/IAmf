type Props = {
  fromInput: string;
  toInput: string;
  rangeAllTime: boolean;
  appliedLabel: string | null;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onRangeAllTimeChange: (v: boolean) => void;
  onApply: () => void;
};

export default function PlatformDateRangeBar({
  fromInput,
  toInput,
  rangeAllTime,
  appliedLabel,
  onFromChange,
  onToChange,
  onRangeAllTimeChange,
  onApply,
}: Props) {
  return (
    <div className="admin-date-range">
      <span className="admin-date-range-label">Período del reporte</span>
      <label className="admin-date-range-field">
        <span>Desde</span>
        <input
          type="date"
          value={fromInput}
          disabled={rangeAllTime}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </label>
      <label className="admin-date-range-field">
        <span>Hasta</span>
        <input
          type="date"
          value={toInput}
          disabled={rangeAllTime}
          onChange={(e) => onToChange(e.target.value)}
        />
      </label>
      <label className="admin-date-range-alltime">
        <input
          type="checkbox"
          checked={rangeAllTime}
          onChange={(e) => onRangeAllTimeChange(e.target.checked)}
        />
        Todo el período
      </label>
      <button type="button" className="btn-secondary btn-sm" onClick={onApply} disabled={rangeAllTime}>
        Aplicar fechas
      </button>
      {appliedLabel ? <span className="admin-date-range-hint">{appliedLabel}</span> : null}
    </div>
  );
}
