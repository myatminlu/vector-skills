import { registerModule } from '@/modules/slots';

import { useTextScale } from './store';
import { TextSizeSection } from './text-size-section';

registerModule({
  name: 'text-size',
  overrides: { useTextScale },
  accountSections: [{ id: 'text-size', slot: 'settings', order: 10, Component: TextSizeSection }],
});
