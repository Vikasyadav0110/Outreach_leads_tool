// Persist a lead's outcome (status and/or notes) for a campaign.
// Returns true on success. Components handle optimistic state + toasts.
export async function saveOutcome(campaignId, body) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
