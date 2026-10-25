import { privacySettings, type PrivacyChoice } from "./privacy.server";

export function privacyResponse(choice?: PrivacyChoice) {
  const settings = privacySettings();
  return {
    enabled: settings.enabled,
    version: settings.version,
    decided: Boolean(choice),
    sessionPersonalization: settings.enabled && choice?.sessionPersonalization === true,
    modelImprovement: settings.enabled && choice?.modelImprovement === true,
    retention: settings.retention,
    session: { idleMinutes: 30, maxHours: 12 },
    operator: settings.operator,
    contact: settings.contact,
    country: "US",
    modelTrainingActive: false,
    ...(!settings.enabled ? { disabledReason: "operator-review-or-configuration-required" } : {}),
  };
}
