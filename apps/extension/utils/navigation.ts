import type { DocumentDetail } from '@lumi/shared';
import type { ExtensionSettings } from './storage';

export async function openDocument(
  settings: ExtensionSettings,
  document: DocumentDetail,
) {
  const baseUrl = settings.webBaseUrl.replace(/\/$/, '');
  await browser.tabs.create({
    url: `${baseUrl}/documents/${document.id}`,
  });
}

export async function openOptionsPage() {
  await browser.runtime.openOptionsPage();
}
