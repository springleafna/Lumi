import { createLumiClient } from '@lumi/api-client'

export const TOKEN_KEY = 'lumi_access_token'
export const SERVER_URL_KEY = 'lumi_server_url'

/** 移动端的服务器地址是运行时配置（首次启动在 /setup 填写），不来自构建时 env。 */
export function getServerUrl(): string {
  return (localStorage.getItem(SERVER_URL_KEY) || '').replace(/\/+$/, '')
}

export function hasServerUrl(): boolean {
  return /^https?:\/\/.+/.test(getServerUrl())
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (/^https?:\/\//.test(trimmed)) return trimmed
  return trimmed ? `https://${trimmed}` : ''
}

export function setServerUrl(value: string): void {
  const normalized = normalizeServerUrl(value)
  if (!normalized) throw new Error('服务器地址不能为空')
  localStorage.setItem(SERVER_URL_KEY, normalized)
}

export const client = createLumiClient({
  // 用户只填服务器根地址，API 前缀统一在这里补全（路径以 /documents 等相对形式注册）。
  baseUrl: `${getServerUrl()}/api`,
  getToken: () => localStorage.getItem(TOKEN_KEY),
})
