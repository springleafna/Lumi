export type CapturedPageUrl = {
  url: string;
  title: string;
};

export type CapturedPageHtml = CapturedPageUrl & {
  html: string;
};

export type CapturedSelection = CapturedPageUrl & {
  selectedHtml: string;
  selectedText: string;
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

export async function captureSelection(): Promise<CapturedSelection> {
  const tab = await getActiveTab();
  if (!tab.id) {
    throw new Error('无法读取当前标签页');
  }

  const [result] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || '';
      let selectedHtml = '';

      if (selection && selection.rangeCount > 0 && selectedText) {
        const container = document.createElement('div');
        for (let index = 0; index < selection.rangeCount; index += 1) {
          container.append(selection.getRangeAt(index).cloneContents());
        }
        selectedHtml = container.innerHTML;
      }

      return {
        url: window.location.href,
        title: document.title,
        selectedHtml,
        selectedText,
      };
    },
  });

  const captured = result?.result;
  if (!captured?.url || !captured.selectedText) {
    throw new Error('请先在页面中选中内容');
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
