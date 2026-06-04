import { createLumiClient } from '@lumi/api-client';
import type { ExtensionSettings } from './storage';
import { getSettings } from './storage';

export async function createExtensionClient(settings?: ExtensionSettings) {
  const resolved = settings ?? (await getSettings());
  return createLumiClient({
    baseUrl: resolved.apiBaseUrl,
    getToken: () => resolved.accessToken,
  });
}
