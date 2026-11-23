import { registerModule } from '@/modules/slots';

// No screens of its own: features call `requestMultipart` (./upload) for photos and files.
registerModule({ name: 'uploads' });
