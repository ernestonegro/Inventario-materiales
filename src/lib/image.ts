/**
 * Reduce la foto del celular (típicamente 3–8 MB) a ~150–400 KB antes de subirla:
 * lado mayor 1600 px, JPEG calidad 0.72. Suficiente para leer un remito.
 */
export async function comprimirImagen(file: File, maxLado = 1600, calidad = 0.72): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', calidad));
  if (!blob) throw new Error('No se pudo comprimir la imagen');
  return blob;
}
