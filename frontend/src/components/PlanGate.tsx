import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { type PlanTier, PLAN_FEATURES, PLAN_HIERARCHY } from "../types";

type PlanGateProps = {
  /** Current user's plan tier */
  userPlan: PlanTier;
  /** Minimum plan required to see this content */
  requiredPlan: PlanTier;
  /** Feature key to check (alternative to requiredPlan) */
  feature?: keyof typeof PLAN_FEATURES.pro;
  children: ReactNode;
};

function planIndex(tier: PlanTier): number {
  return PLAN_HIERARCHY.indexOf(tier);
}

function getRequiredPlanForFeature(feature: keyof typeof PLAN_FEATURES.pro): PlanTier {
  for (const tier of PLAN_HIERARCHY) {
    if (PLAN_FEATURES[tier][feature as keyof typeof PLAN_FEATURES.pro]) return tier;
  }
  return "elite";
}

export function PlanGate({ userPlan, requiredPlan, feature, children }: PlanGateProps) {
  const navigate = useNavigate();
  const effectiveRequired = feature ? getRequiredPlanForFeature(feature) : requiredPlan;
  const hasAccess = planIndex(userPlan) >= planIndex(effectiveRequired);

  if (hasAccess) return <>{children}</>;

  const requiredName = PLAN_FEATURES[effectiveRequired]?.name ?? effectiveRequired;

  return (
    <div className="plan-gate">
      <div className="plan-gate__card">
        <div className="plan-gate__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 className="plan-gate__title">Disponible en {requiredName}</h3>
        <p className="plan-gate__desc">
          Actualiza tu plan para acceder a esta funcionalidad.
        </p>
        <button
          type="button"
          className="plan-gate__cta"
          onClick={() => navigate("/athlete/settings")}
        >
          Ver planes
        </button>
      </div>
    </div>
  );
}

/** Hook helper to check feature access */
export function usePlanAccess(userPlan: string | undefined) {
  const tier = (userPlan || "free") as PlanTier;
  const features = PLAN_FEATURES[tier] || PLAN_FEATURES.free;

  return {
    tier,
    features,
    hasFeature: (feature: keyof typeof PLAN_FEATURES.pro) => {
      return !!features[feature as keyof typeof features];
    },
    canAccessPlan: (required: PlanTier) => planIndex(tier) >= planIndex(required),
  };
}
