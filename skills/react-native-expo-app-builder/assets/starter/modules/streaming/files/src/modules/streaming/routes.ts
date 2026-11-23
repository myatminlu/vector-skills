import type { Href } from 'expo-router';

export const askHref = (params?: { itemId?: string }) => ({ pathname: '/ask', params }) as Href;
