import type { ExtraLanguage } from '@/i18n/languages';

const BURMESE_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

export function toBurmeseDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => BURMESE_DIGITS[Number(digit)] ?? digit);
}

/**
 * Burmese, without its strings — the generated `src/modules/strings.ts` adds those of the installed modules. Device
 * locales and APIs disagree on the code (`my`, `my-MM`, the older `mm`); all of them mean this language.
 */
export const burmese: Omit<ExtraLanguage, 'strings'> = {
  code: 'my',
  name: 'မြန်မာ',
  locale: 'my-MM',
  matches: (tag) => tag === 'my' || tag === 'mm' || tag.startsWith('my-') || tag.startsWith('my_'),
  // Counts use Burmese digits. Prices and codes usually should not — decide per design.
  formatCount: (value) => toBurmeseDigits(new Intl.NumberFormat('en-US').format(value)),
};

export const language = burmese;
