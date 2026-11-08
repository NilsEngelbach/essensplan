/** Downscales a picked photo (longest side 1600 px, JPEG) for the preview and a small upload; the server makes the final versions. */
export function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.88))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** A data: or blob: URL back into a Blob for FormData. */
export function photoBlob(url: string): Promise<Blob> {
  return fetch(url).then((r) => r.blob())
}
