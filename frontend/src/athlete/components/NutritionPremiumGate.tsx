// Used in: NutritionPage.tsx — wraps premium-only sections
// Also available standalone for embedding in other pages

type Props = {
  planTier: string;
  featureName: string;
  children: React.ReactNode;
};

const PREMIUM_TIERS = ["pro", "pro_plus", "elite"];

export function NutritionPremiumGate({ planTier, featureName, children }: Props) {
  if (PREMIUM_TIERS.includes(planTier)) {
    return <>{children}</>;
  }

  return (
    <div className="ath-nutr-gate">
      <div className="ath-nutr-gate-content">
        <div className="ath-nutr-gate-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="ath-nutr-gate-feature">{featureName}</p>
        <p className="ath-nutr-gate-cta">Disponible con Plan Pro</p>
      </div>
      <div className="ath-nutr-gate-backdrop" />
    </div>
  );
}
