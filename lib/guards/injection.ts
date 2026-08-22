/**
 * Guards for untrusted text entering any LLM context or the ledger.
 * The simulation treats merchant names, memos and threat-intel documents as
 * DATA — never as instructions.
 */

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi, "[FILTERED:instruction-override]"],
  [/disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|rules?|prompts?)/gi, "[FILTERED:instruction-override]"],
  [/you\s+are\s+now\s+(a|an|the)\s+/gi, "[FILTERED:role-hijack]"],
  [/system\s*prompt/gi, "[FILTERED:system-ref]"],
  [/mark\s+(this|it)\s+(transaction\s+)?(safe|allow(ed)?)/gi, "[FILTERED:decision-manipulation]"],
  [/approve\s+(this|the)\s+transaction/gi, "[FILTERED:decision-manipulation]"],
  [/<\/?(system|assistant|user|data)>/gi, "[FILTERED:tag]"],
];

export function scrubUntrusted(text: string): string {
  let out = text ?? "";
  for (const [re, replacement] of INJECTION_PATTERNS) out = out.replace(re, replacement);
  return out.slice(0, 4000);
}

const PAN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/;
const CVV_CONTEXT = /\b(cvv|cvc|security\s*code)\D{0,5}\d{3,4}\b/i;
const OTP_CONTEXT = /\b(otp|one[-\s]?time\s*(password|code)|pin)\D{0,5}\d{4,8}\b/i;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;

export class CredentialGuardError extends Error {
  constructor(public kind: string) {
    super(`rejected input containing ${kind}`);
  }
}

/** Throws if the text looks like real financial credentials (T19). */
export function rejectRealCredentials(text: string): void {
  if (PAN.test(text)) throw new CredentialGuardError("PAN");
  if (CVV_CONTEXT.test(text)) throw new CredentialGuardError("CVV");
  if (OTP_CONTEXT.test(text)) throw new CredentialGuardError("OTP/PIN");
  if (IBAN.test(text)) throw new CredentialGuardError("IBAN");
}

export function guardUntrustedText(text: string): string {
  rejectRealCredentials(text);
  return scrubUntrusted(text);
}
