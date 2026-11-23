import { NotoSansMyanmar_400Regular } from '@expo-google-fonts/noto-sans-myanmar/400Regular';
import { NotoSansMyanmar_600SemiBold } from '@expo-google-fonts/noto-sans-myanmar/600SemiBold';

import { registerModule } from '@/modules/slots';

import { myanmarScript } from './script';

// The language itself (strings, digits, tags) is plain data in the generated src/modules/strings.ts; this registers
// the font and the line-height rule that every AppText and FormField applies to Myanmar text.
registerModule({
  name: 'lang-my',
  fonts: { NotoSansMyanmar_400Regular, NotoSansMyanmar_600SemiBold },
  textScripts: [myanmarScript],
});
