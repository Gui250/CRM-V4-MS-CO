import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// React Flow (automation editor) measures nodes; jsdom has neither API.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
globalThis.DOMMatrixReadOnly ??= class {
  m22 = 1
  constructor(transform?: string) {
    const scale = /scale\(([-\d.]+)\)/.exec(transform ?? '')
    this.m22 = scale ? Number(scale[1]) : 1
  }
} as unknown as typeof DOMMatrixReadOnly
