// Phone/email helpers shared by the contact-aware components (MessageTabs,
// QualificationCards). No client-only APIs, so this is safe to import from
// either server or client components.

// Normalize a phone string to a wa.me / tel-compatible digit string, or null
// if it isn't a usable number ("Not found", a landline fragment, junk). The
// app targets India, so a bare 10-digit mobile gets the 91 country code.
export function toDigits(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return digits;
}

export function isEmail(raw) {
  return !!raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim());
}

// Build a wa.me link from a raw number + message text, or null if unusable.
export function waHref(rawNumber, text) {
  const digits = toDigits(rawNumber);
  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text || "")}`
    : null;
}

// Build a mailto link from a raw address + subject/body, or null if invalid.
export function mailHref(rawEmail, subject, body) {
  if (!isEmail(rawEmail)) return null;
  return `mailto:${String(rawEmail).trim()}?subject=${encodeURIComponent(
    subject || ""
  )}&body=${encodeURIComponent(body || "")}`;
}
