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

// Set a lead's per-campaign engagement (Mark as sent / replied / …). Returns the
// FRESH re-hydrated campaign (so the UI can refresh the progress strip + rows in
// one shot), or null on failure.
export async function saveEngagement(campaignId, body) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()).campaign;
  } catch {
    return null;
  }
}
