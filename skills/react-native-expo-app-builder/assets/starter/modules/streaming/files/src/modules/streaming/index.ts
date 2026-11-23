import { router } from 'expo-router';

import { registerModule } from '@/modules/slots';

import { AskAction } from './ask-action';
import { askHref } from './routes';

registerModule({
  name: 'streaming',
  stackScreens: [{ name: 'ask', options: (_colors, t) => ({ title: t('ask_title') }) }],
  itemActions: [{ id: 'ask', order: 20, Component: AskAction }],
  tourSteps: [{ id: 'ask', order: 25, name: 'ask', go: () => router.push(askHref({ itemId: '1' })) }],
});
