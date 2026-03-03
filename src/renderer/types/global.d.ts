import type { KanbaiAPI } from '../../preload/index'

declare global {
  interface Window {
    kanbai: KanbaiAPI
  }
}
