// Reads QR codes from the camera: the browser's BarcodeDetector where it exists (Chrome/Android), else jsQR
// (iPhone Safari, Firefox). Call start() with a <video>; onCode fires once per new code.
import jsQR from 'jsqr'

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  video.srcObject = stream
  video.setAttribute('playsinline', 'true')
  // play() can be interrupted when the scanner restarts quickly; frames still arrive once it plays.
  await video.play().catch(() => {})

  let detector: Detector | null = null
  try {
    if (window.BarcodeDetector) detector = new window.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    detector = null
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let alive = true
  let timer = 0

  const read = async (): Promise<string | null> => {
    if (video.readyState < 2) return null
    if (detector) {
      try {
        return (await detector.detect(video))[0]?.rawValue ?? null
      } catch {
        detector = null // fall back to jsQR from now on
      }
    }
    if (!ctx) return null
    // Scan a centred square, scaled down: fast enough on older phones.
    const side = Math.min(video.videoWidth, video.videoHeight)
    const size = Math.min(480, side)
    canvas.width = size
    canvas.height = size
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size)
    const img = ctx.getImageData(0, 0, size, size)
    return jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null
  }

  const tick = async () => {
    if (!alive) return
    if (video.paused && video.srcObject === stream) video.play().catch(() => {})
    const code = await read()
    if (code && alive) onCode(code.trim())
    timer = window.setTimeout(tick, 180)
  }
  void tick()

  return () => {
    alive = false
    clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    if (video.srcObject === stream) video.srcObject = null // a newer scanner may own the video now
  }
}

export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
