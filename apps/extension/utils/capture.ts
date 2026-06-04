export type CapturedPageUrl = {
  url: string;
  title: string;
};

export type CapturedPageHtml = CapturedPageUrl & {
  html: string;
};

export async function capturePageUrl(): Promise<CapturedPageUrl> {
  const tab = await getActiveTab();
  return {
    url: tab.url || '',
    title: tab.title || '',
  };
}

export async function capturePageHtml(): Promise<CapturedPageHtml> {
  const tab = await getActiveTab();
  if (!tab.id) {
    throw new Error('无法读取当前标签页');
  }

  const [result] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML,
    }),
  });

  const captured = result?.result;
  if (!captured?.url || !captured?.html) {
    throw new Error('无法读取当前页面内容');
  }

  return captured;
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.url) {
    throw new Error('无法获取当前页面地址');
  }

  return tab;
}
