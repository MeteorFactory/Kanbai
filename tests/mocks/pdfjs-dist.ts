// Mock for pdfjs-dist (not installed in test environment)
export const GlobalWorkerOptions = { workerSrc: '' }

export function getDocument() {
  return {
    promise: Promise.resolve({
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      destroy: () => {},
    }),
  }
}
