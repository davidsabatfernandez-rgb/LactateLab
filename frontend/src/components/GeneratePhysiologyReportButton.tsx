type GeneratePhysiologyReportButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function GeneratePhysiologyReportButton({
  onClick,
  disabled = false,
  loading = false,
}: GeneratePhysiologyReportButtonProps) {
  return (
    <button
      className="primary-button physiology-report-button"
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? "Generando informe..." : "Generar informe fisiológico"}
    </button>
  );
}
