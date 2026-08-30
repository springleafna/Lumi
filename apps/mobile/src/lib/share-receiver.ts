import { App } from '@capacitor/app'

/** 系统分享进来的内容（MainActivity 改写后的深链参数）。 */
export type SharedPayload = {
  text: string
  title?: string
}

const SHARE_ORIGIN = 'https://localhost/_share'

/**
 * 解析 MainActivity 改写出的分享深链。
 * 仅接受自身 origin 的 /_share 路径，避免把普通外链误当分享。
 */
export function parseShareUrl(url: string): SharedPayload | null {
  if (!url.startsWith(SHARE_ORIGIN)) return null
  const params = new URLSearchParams(url.slice(SHARE_ORIGIN.length))
  const text = params.get('text')?.trim()
  if (!text) return null
  return {
    text,
    title: params.get('title')?.trim() || undefined,
  }
}

/** 文本中提取第一个 http(s) 链接；截掉中文分享常见的收尾引号/括号。 */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s，。；、！？？]+/i)
  if (!match) return null
  return match[0].replace(/[)）\]】》"'”’]+$/, '')
}

/**
 * 注册分享接收。冷启动走 App.getLaunchUrl（App 插件保证加载后可取），
 * 热启动走 appUrlOpen 事件。浏览器开发环境没有原生实现，静默忽略。
 */
export async function initShareReceiver(onShare: (payload: SharedPayload) => void): Promise<void> {
  try {
    const launch = await App.getLaunchUrl()
    const payload = launch?.url ? parseShareUrl(launch.url) : null
    if (payload) onShare(payload)
  } catch {
    return
  }

  try {
    await App.addListener('appUrlOpen', (event) => {
      const payload = parseShareUrl(event.url)
      if (payload) onShare(payload)
    })
  } catch {
    // 同上，非原生环境忽略
  }
}
