import { registerModule } from '@/modules/slots';

import { wrapWithPersistence } from './persist-provider';

registerModule({ name: 'offline-cache', wrapQuery: wrapWithPersistence });
