/**
 * 视频阅读辅助：B 站链接解析、时长格式化、正文 [mm:ss] 锚点包裹。
 *
 * 锚点后处理作用于 v-html 注入的正文（必须在 DOM 上做，见
 * DocumentDetailPage 的 refreshRuntimeToc 流程）：把文本里的 [mm:ss]
 * 替换为可点击的 .video-anchor 按钮，点击后由详情页驱动播放器 seek。
 */

export type BilibiliVideoLink = {
  videoId: string;
  page: number;
};

const VIDEO_ANCHOR_PATTERN = /\[(\d{1,3}):([0-5]\d)\]/g;

export function parseBilibiliVideoUrl(url: string): BilibiliVideoLink | null {
  try {
    const parsed = new URL(url);
    if (!['www.bilibili.com', 'm.bilibili.com'].includes(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{8,12}|av\d+)$/);
    if (!match) return null;
    const page = Number(parsed.searchParams.get('p'));
    return {
      videoId: match[1],
      page: Number.isInteger(page) && page >= 1 ? page : 1,
    };
  } catch {
    return null;
  }
}

/** 秒 → mm:ss（超 1 小时分钟位自然进位，如 75:30） */
export function formatVideoDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function parseVideoAnchorSeconds(text: string): number | null {
  VIDEO_ANCHOR_PATTERN.lastIndex = 0;
  const match = VIDEO_ANCHOR_PATTERN.exec(text);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * 扫描正文文本节点，把 [mm:ss] 包裹成可点击按钮（保留原始展示文本）。
 * 代码块内不处理；重复调用安全（已是按钮的文本不会再匹配）。
 */
export function wrapVideoAnchors(container: HTMLElement | null): void {
  if (!container) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('pre, code, button, [data-video-seek]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return VIDEO_ANCHOR_PATTERN.test(node.nodeValue || '')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  VIDEO_ANCHOR_PATTERN.lastIndex = 0;
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    wrapTextNode(node);
  }
}

function wrapTextNode(node: Text): void {
  const text = node.nodeValue || '';
  VIDEO_ANCHOR_PATTERN.lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = VIDEO_ANCHOR_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }

    const seconds = Number(match[1]) * 60 + Number(match[2]);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-anchor';
    button.dataset.videoSeek = String(seconds);
    button.textContent = match[0];
    button.setAttribute('aria-label', `跳转到视频 ${match[0]}`);
    fragment.appendChild(button);
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return;
  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }
  node.parentNode?.replaceChild(fragment, node);
}
