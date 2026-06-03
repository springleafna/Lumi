import { createLumiClient } from '@lumi/api-client'

export const TOKEN_KEY = 'lumi_access_token'

export const client = createLumiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  getToken: () => localStorage.getItem(TOKEN_KEY),
})
