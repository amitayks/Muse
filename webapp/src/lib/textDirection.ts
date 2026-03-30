/**
 * Detect text direction based on first strong character.
 * Matches X/Twitter behavior: first Hebrew/Arabic char -> RTL, first Latin/digit -> LTR.
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  const match = text.match(/[\u0590-\u05FF\u0600-\u06FF]|[a-zA-Z0-9]/);
  if (!match) return 'ltr';
  return /[\u0590-\u05FF\u0600-\u06FF]/.test(match[0]) ? 'rtl' : 'ltr';
}
