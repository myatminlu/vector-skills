import { registerModule } from '@/modules/slots';

import { useRemoteFlag } from './queries';

registerModule({ name: 'remote-config', overrides: { useFlag: useRemoteFlag } });
