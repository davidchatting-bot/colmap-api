/**
 * colmap-api client
 *
 * Usage:
 *   import { submitPoseJob } from '/client.js'
 *
 *   const imgElements = document.querySelectorAll('.scene-image')
 *   const { jobId, poses, cameras } = await submitPoseJob(imgElements, {
 *     apiBase: 'https://your-droplet-ip:3000',
 *     onProgress: ({ stage, log }) => console.log(stage, log),
 *   })
 */

/**
 * Extract a JPEG Blob from an <img> element via canvas.
 *
 * Cross-origin images require the server to send CORS headers AND
 * the <img> element to have crossOrigin="anonymous" set before src is assigned.
 */
async function imgToBlob(imgEl, quality = 0.92) {
  // If the img src is a same-origin URL we can also just fetch it directly
  if (!imgEl.crossOrigin && isCrossOrigin(imgEl.src)) {
    // Fall back to fetching the URL directly (works if the image server allows CORS)
    const res = await fetch(imgEl.src)
    if (!res.ok) throw new Error(`Failed to fetch image: ${imgEl.src}`)
    return res.blob()
  }

  await waitForLoad(imgEl)

  const canvas = document.createElement('canvas')
  canvas.width  = imgEl.naturalWidth
  canvas.height = imgEl.naturalHeight

  const ctx = canvas.getContext('2d')
  ctx.drawImage(imgEl, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
      'image/jpeg',
      quality,
    )
  })
}

function isCrossOrigin(src) {
  try {
    return new URL(src).origin !== window.location.origin
  } catch {
    return false
  }
}

function waitForLoad(imgEl) {
  if (imgEl.complete && imgEl.naturalWidth > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    imgEl.addEventListener('load', resolve, { once: true })
    imgEl.addEventListener('error', () => reject(new Error(`Image failed to load: ${imgEl.src}`)), { once: true })
  })
}

/**
 * Submit a set of <img> elements for camera pose estimation.
 *
 * @param {NodeList|HTMLImageElement[]} imgElements
 * @param {{ apiBase?: string, onProgress?: Function, quality?: number }} options
 * @returns {Promise<{ jobId: string, cameras: object, poses: object[] }>}
 */
export async function submitPoseJob(imgElements, options = {}) {
  const {
    apiBase = '',
    onProgress = () => {},
    quality = 0.92,
  } = options

  const images = Array.from(imgElements)
  if (images.length < 2) throw new Error('At least 2 images are required')

  // Build FormData
  onProgress({ stage: 'Preparing images' })
  const form = new FormData()

  await Promise.all(images.map(async (img, i) => {
    const blob = await imgToBlob(img, quality)
    const name = img.dataset.filename || img.alt || `image_${String(i).padStart(4, '0')}.jpg`
    form.append('images', blob, name.endsWith('.jpg') ? name : name + '.jpg')
  }))

  // POST job
  onProgress({ stage: 'Uploading images' })
  const postRes = await fetch(`${apiBase}/jobs`, { method: 'POST', body: form })
  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}))
    throw new Error(err.error || `Upload failed: ${postRes.status}`)
  }
  const { jobId } = await postRes.json()

  // Connect WebSocket and wait for completion
  const result = await watchJob(jobId, apiBase, onProgress)
  return { jobId, ...result }
}

function watchJob(jobId, apiBase, onProgress) {
  return new Promise((resolve, reject) => {
    const wsBase = apiBase.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsBase}/jobs/${jobId}/ws`)

    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data)
      const job = msg.job

      if (job.progress) onProgress(job.progress)

      if (job.status === 'done') {
        ws.close()
        resolve(job.result)
      } else if (job.status === 'error') {
        ws.close()
        reject(new Error(job.error))
      }
    })

    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')))
  })
}
