/**
 * Avir Security Sanitizer & Prompt Injection Firewall
 * Defends against OWASP Top 10 for LLMs (Prompt Injection, Insecure Output Handling, XSS).
 */

const INJECTION_PATTERNS = [
  {
    name: 'instruction_override',
    regex: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|directives|rules|prompts)/i,
  },
  {
    name: 'role_hijack',
    regex: /(?:you\s+are\s+now|pretend\s+to\s+be|act\s+as|roleplay\s+as)\s+(?:an?\s+)?(?:unrestricted|jailbroken|evil|unfiltered|hacker|dan|developer\s+mode)/i,
  },
  {
    name: 'system_token_leak',
    regex: /(?:<\|system\|>|<\|im_start\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\/s>|<\|assistant\|>)/i,
  },
  {
    name: 'system_prompt_leak',
    regex: /(?:reveal|show|dump|print)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|secret\s+key)/i,
  },
];

/**
 * Strips dangerous HTML tags, inline event handlers, and pseudoprotocols.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    // Remove script tags and contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove iframe tags and contents
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove inline event handlers (onerror, onload, onclick, onmouseover, etc.)
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Remove javascript: pseudoprotocol
    .replace(/javascript:[^"'>\s]*/gi, '')
    // Strip standalone angle brackets for dangerous tags
    .replace(/<\/?(?:embed|object|base|link|meta)\b[^>]*>/gi, '')
    .trim();
}

export interface PromptInjectionInspectionResult {
  isThreatDetected: boolean;
  detectedPatterns: string[];
  cleanText: string;
}

/**
 * Scans user input for adversarial prompt injection signatures.
 */
export function inspectPromptInjection(input: string): PromptInjectionInspectionResult {
  const sanitized = sanitizeText(input);
  const detectedPatterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      detectedPatterns.push(pattern.name);
    }
  }

  return {
    isThreatDetected: detectedPatterns.length > 0,
    detectedPatterns,
    cleanText: sanitized,
  };
}

export interface InputValidationResult {
  sanitized: string;
  truncated: boolean;
  isValid: boolean;
}

/**
 * Validates payload boundaries, caps character limits, and sanitizes text.
 */
export function validateAndSanitizeInput(
  rawInput: string,
  maxLength: number = 1000
): InputValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { sanitized: '', truncated: false, isValid: false };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { sanitized: '', truncated: false, isValid: false };
  }

  let sanitized = sanitizeText(trimmed);
  let truncated = false;

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    truncated = true;
  }

  return {
    sanitized,
    truncated,
    isValid: sanitized.length > 0,
  };
}
