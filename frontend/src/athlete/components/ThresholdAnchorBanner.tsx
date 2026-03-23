type AnchorStatus = {
  status: "anclado" | "detectado" | "consolidado" | "mixed";
  anchor_source: string;
  message_short: string;
  message_athlete: string;
};

const STATUS_CONFIG: Record<string, { icon: string; className: string }> = {
  anclado:      { icon: "○", className: "ath-anchor-banner--reference" },
  detectado:    { icon: "◑", className: "ath-anchor-banner--provisional" },
  consolidado:  { icon: "✓", className: "ath-anchor-banner--consolidated" },
  mixed:        { icon: "◑", className: "ath-anchor-banner--provisional" },
};

export function ThresholdAnchorBanner({ anchorStatus }: { anchorStatus?: AnchorStatus | null }) {
  if (!anchorStatus) return null;
  const cfg = STATUS_CONFIG[anchorStatus.status] ?? STATUS_CONFIG.anclado;
  return (
    <div className={`ath-anchor-banner ${cfg.className}`}>
      <span className="ath-anchor-banner__icon">{cfg.icon}</span>
      <div className="ath-anchor-banner__content">
        <span className="ath-anchor-banner__badge">{anchorStatus.message_short}</span>
        <span className="ath-anchor-banner__msg">{anchorStatus.message_athlete}</span>
      </div>
    </div>
  );
}
