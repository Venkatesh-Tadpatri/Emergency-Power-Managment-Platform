import { COUNTRY_CODES, DEFAULT_COUNTRY } from "../pages/auth/countryCodes";
import { emailError, formatPhone, phoneError } from "../components/users/userFields";

/** Shared with the API: a person's full name, and the RFC 5321 email maximums. */
export const CONTACT_NAME_MAX = 50;
export const EMAIL_MAX = 254;
export const EMAIL_LOCAL_MAX = 64;

/** Organisation names may include digits ("3M", "Unit 42") but must contain letters. Mirrors the API. */
export function companyNameError(raw: string): string | undefined {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return "Company name is required";
  if (value.length < 2) return "Company name must be at least 2 characters";
  if (value.length > 120) return "Company name must be at most 120 characters";
  if (!/\p{L}/u.test(value)) return "Company name cannot be numbers only — include letters";
  if (!/^[\p{L}\p{M}\p{N} &.,'()/-]+$/u.test(value)) return "Use only letters, numbers, spaces and & . , ' ( ) / -";
  return undefined;
}

/** Optional person name: letters, spaces, apostrophes, periods or hyphens — never digits. */
export function contactNameError(raw: string): string | undefined {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  if (!/\p{L}/u.test(value) || !/^[\p{L}\p{M} .'-]+$/u.test(value)) return "Enter a valid contact name — letters, spaces, apostrophes, periods or hyphens only (no numbers)";
  if (value.length < 2) return "Contact name must be at least 2 characters";
  if (value.length > CONTACT_NAME_MAX) return `Contact name must be at most ${CONTACT_NAME_MAX} characters`;
  return undefined;
}

/** Strips characters a person name can never contain, as the user types. */
export const sanitizeContactName = (value: string) => value.replace(/[^\p{L}\p{M} .'-]/gu, "").replace(/\s{2,}/g, " ");

export function optionalEmailError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > EMAIL_MAX) return `Email must be at most ${EMAIL_MAX} characters`;
  if (trimmed.split("@")[0].length > EMAIL_LOCAL_MAX) return `The part before @ must be at most ${EMAIL_LOCAL_MAX} characters`;
  return emailError(trimmed);
}
export const optionalPhoneError = (country: string, digits: string) => (digits ? phoneError(country, digits) : undefined);

/** Splits a stored "+91 9876543210" (or a legacy bare number) into the country picker and the digits. */
export function splitStoredPhone(value: string | null | undefined): { country: string; phone: string } {
  const compact = (value || "").trim().replace(/[()\s-]/g, "");
  if (!compact) return { country: DEFAULT_COUNTRY, phone: "" };
  if (!compact.startsWith("+")) return { country: DEFAULT_COUNTRY, phone: compact.replace(/\D/g, "") };
  const country = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length).find((item) => compact.startsWith(item.dial));
  return { country: country?.iso || DEFAULT_COUNTRY, phone: compact.replace(country?.dial || "", "").replace(/\D/g, "") };
}

export const joinPhone = (country: string, digits: string) => (digits ? formatPhone(country, digits) : "");

/** FastAPI returns 422 details as a list; turn either shape into one readable sentence. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => String(item?.msg || "").replace(/^Value error, /, "")).filter(Boolean);
    if (messages.length) return messages.map((message) => message.charAt(0).toUpperCase() + message.slice(1)).join(". ");
  }
  return fallback;
}
