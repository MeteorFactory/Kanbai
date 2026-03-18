import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

// Use the bundled worker from pdfjs-dist
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Renders the first page of a PDF to a data URL thumbnail.
 * Returns null if rendering fails.
 */
export async function renderPdfFirstPage(
  pdfDataUrl: string,
  maxSize: number
): Promise<string | null> {
  try {
    const loadingTask = getDocument(pdfDataUrl)
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)

    const viewport = page.getViewport({ scale: 1 })
    const scale = maxSize / Math.max(viewport.width, viewport.height)
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height

    const context = canvas.getContext('2d')
    if (!context) {
      pdf.destroy()
      return null
    }

    await page.render({ canvas, canvasContext: context, viewport: scaledViewport }).promise
    const dataUrl = canvas.toDataURL('image/png')
    pdf.destroy()
    return dataUrl
  } catch {
    return null
  }
}
