import { COUNTRY_CODES, NATIONAL_LENGTH } from "../../pages/auth/countryCodes";

/** Same rules the backend applies to user names and contact numbers (schemas/auth.py). */
export const NAME_MAX = 15;
const NAME_PATTERN = /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trim and collapse internal runs of spaces, e.g. "  Mary   Ann " → "Mary Ann". */
export const cleanName = (value: string) => value.trim().replace(/\s+/g, " ");

/** Drop anything that can't appear in a name as it is typed or pasted. */
export const sanitizeNameInput = (value: string) => value.replace(/[^A-Za-z '\-]/g, "").replace(/ {2,}/g, " ").slice(0, NAME_MAX);

export function nameError(raw: string, label: string): string | undefined {
  const value = cleanName(raw);
  if (!value) return `${label} is required`;
  if (!NAME_PATTERN.test(value)) return `${label} must start and end with a letter (letters, spaces, - and ' only)`;
  if (value.length < 2) return `${label} must be at least 2 characters`;
  if (value.length > NAME_MAX) return `${label} can be at most ${NAME_MAX} characters`;
  return undefined;
}

export function emailError(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Email is required";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address";
  return undefined;
}

export const phoneDigitLimit = (iso: string) => {
  const country = COUNTRY_CODES.find((item) => item.iso === iso);
  return NATIONAL_LENGTH[iso]?.[1] ?? 15 - ((country?.dial.length || 2) - 1);
};

export function phoneError(iso: string, digits: string): string | undefined {
  const country = COUNTRY_CODES.find((item) => item.iso === iso);
  if (!country) return "Select a country code";
  if (!digits) return "Contact number is required";
  const [minDigits, maxDigits] = NATIONAL_LENGTH[iso] || [6, phoneDigitLimit(iso)];
  if (digits.length < minDigits || digits.length > maxDigits) {
    return minDigits === maxDigits ? `Enter a ${minDigits}-digit number for ${country.name}` : `Enter a ${minDigits}–${maxDigits} digit number for ${country.name}`;
  }
  return undefined;
}

/** "+91 9876543210" — the format the API expects. */
export const formatPhone = (iso: string, digits: string) => `${COUNTRY_CODES.find((item) => item.iso === iso)?.dial || ""} ${digits}`;

/** The API stores UTC without a zone marker; read it as UTC so it shows in local time. */
export const parseUtc = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
