import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'
import type { TokenRefreshResponse } from '../types/api'
import { getLang } from '../i18n'

const RAW_BASE_URL = import.meta.env.VITE_API_URL?.trim()
const BASE_URL = RAW_BASE_URL ? RAW_BASE_URL.replace(/\/$/, '') : ''


const ACCESS_KEY  = 'ceda_access'
const REFRESH_KEY = 'ceda_refresh'

export const tokenStorage = {
  getAccess:    ()          => localStorage.getItem(ACCESS_KEY),
  setAccess:    (t: string) => localStorage.setItem(ACCESS_KEY, t),
  getRefresh:   ()          => localStorage.getItem(REFRESH_KEY),
  setRefresh:   (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear:        ()          => { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY) },
}


const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})


api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess()
  config.headers = config.headers ?? {}
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  // The API returns content text in this language (en or tn).
  config.headers['Accept-Language'] = getLang()
  return config
})


let isRefreshing  = false
let refreshQueue: Array<(token: string) => void> = []

function drainQueue(token: string) {
  refreshQueue.forEach(cb => cb(token))
  refreshQueue = []
}

api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const refresh = tokenStorage.getRefresh()
    if (!refresh) {
      tokenStorage.clear()
      window.dispatchEvent(new Event('auth:logout'))
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((token: string) => {
          original._retry = true
          original.headers = original.headers ?? {}
          original.headers['Authorization'] = `Bearer ${token}`
          resolve(api(original))
        })
        void Promise.resolve().then(() => {
          if (!isRefreshing) reject(error)
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post<TokenRefreshResponse>(
        `${BASE_URL}/api/auth/refresh/`,
        { refresh }
      )
      tokenStorage.setAccess(data.access)
      tokenStorage.setRefresh(data.refresh)
      drainQueue(data.access)
      original.headers = original.headers ?? {}
      original.headers['Authorization'] = `Bearer ${data.access}`
      return api(original)
    } catch (refreshError) {
      tokenStorage.clear()
      window.dispatchEvent(new Event('auth:logout'))
      drainQueue('')
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
