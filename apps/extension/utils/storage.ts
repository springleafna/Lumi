import type { UserDto } from '@lumi/shared';

export type ExtensionSettings = {
  apiBaseUrl: string;
  webBaseUrl: string;
  accessToken?: string;
  user?: UserDto;
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: 'http://127.0.0.1:3000/api',
  webBaseUrl: 'http://localhost:5173',
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get([
    'apiBaseUrl',
    'webBaseUrl',
    'accessToken',
    'user',
  ]);
  return {
    apiBaseUrl:
      typeof stored.apiBaseUrl === 'string'
        ? stored.apiBaseUrl
        : DEFAULT_SETTINGS.apiBaseUrl,
    webBaseUrl:
      typeof stored.webBaseUrl === 'string'
        ? stored.webBaseUrl
        : DEFAULT_SETTINGS.webBaseUrl,
    accessToken:
      typeof stored.accessToken === 'string' ? stored.accessToken : undefined,
    user: isUser(stored.user) ? stored.user : undefined,
  };
}

export async function saveSettings(settings: Partial<ExtensionSettings>) {
  await browser.storage.local.set(settings);
}

export async function clearAuth() {
  await browser.storage.local.remove(['accessToken', 'user']);
}

function isUser(value: unknown): value is UserDto {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UserDto).id === 'string' &&
    typeof (value as UserDto).username === 'string'
  );
}
