type InsightCardProps = {
  text: string;
  tone?: "info" | "warning" | "positive";
};

export function InsightCard({ text, tone = "info" }: InsightCardProps) {
  return (
    <div className={`ap-insight ${tone}`}>
      <p>{text}</p>
    </div>
  );
}
