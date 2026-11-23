/** A language a module adds (for example lang-my): its code, how it names itself, its strings, how to recognise it. */
export type ExtraLanguage = {
  code: string;
  /** How the language names itself in the picker. */
  name: string;
  /** BCP 47 locale for dates. */
  locale: string;
  /** True for a lower-cased device or API language tag that means this language. */
  matches: (tag: string) => boolean;
  /** Every key of every installed module, in this language (`npm test` checks). */
  strings: Record<string, string>;
  /** Digits or grouping that `Intl` does not produce by default. */
  formatCount?: (value: number) => string;
};
