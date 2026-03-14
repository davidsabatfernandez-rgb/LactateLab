import { ResponsiveContainer, LineChart, Line, ReferenceArea } from "recharts";

type VitalChipProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: string;
  statusTone?: string;
  delta?: string;
  sparkData?: Array<Record<string, unknown>>;
  sparkKey?: string;
  sparkColor?: string;
  sparkRefBand?: { y1: number; y2: number } | null;
  onClick?: () => void;
};

export function VitalChip({
  icon, label, value, status, statusTone, delta,
  sparkData, sparkKey, sparkColor, sparkRefBand, onClick,
}: VitalChipProps) {
  return (
    <button type="button" className="ath-vital-chip" onClick={onClick}>
      <div className="ath-vital-chip-head">
        {icon}
        <span className="ath-vital-chip-label">{label}</span>
      </div>
      <span className="ath-vital-chip-value">{value}</span>
      {status && <span className={`ath-vital-chip-status ${statusTone ?? ""}`}>{status}</span>}
      {sparkData && sparkKey && sparkColor && (
        <div className="ath-vital-chip-spark">
          <ResponsiveContainer width="100%" height={36}>
            <LineChart data={sparkData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              {sparkRefBand && <ReferenceArea y1={sparkRefBand.y1} y2={sparkRefBand.y2} fill={sparkColor} fillOpacity={0.08} />}
              <Line type="monotone" dataKey={sparkKey} stroke={sparkColor} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {delta && <span className="ath-vital-chip-delta">{delta}</span>}
    </button>
  );
}
