import * as ImageManipulator from 'expo-image-manipulator';

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024; // batas backend: 2 MB
const MAX_WIDTH = 1280;

export class ReceiptTooLargeError extends Error {
  constructor() {
    super('Ukuran bukti transfer melebihi 2 MB setelah dikompres');
    this.name = 'ReceiptTooLargeError';
  }
}

const getFileSize = async (uri: string): Promise<number> => {
  const res = await fetch(uri);
  const blob = await res.blob();
  return blob.size;
};

/**
 * Resize (maks 1280px, tidak pernah memperbesar) + JPEG 0.7, lalu cek ukuran.
 * Bila masih > 2 MB, ulangi dengan lebar dan kualitas lebih kecil.
 * Melempar ReceiptTooLargeError bila tetap terlalu besar.
 */
export async function compressPaymentReceipt(uri: string, originalWidth?: number): Promise<string> {
  let width = originalWidth ? Math.min(originalWidth, MAX_WIDTH) : MAX_WIDTH;
  let quality = 0.7;

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    if ((await getFileSize(result.uri)) <= MAX_RECEIPT_BYTES) {
      return result.uri;
    }

    width = Math.round(width * 0.8);
    quality = Math.max(0.4, quality - 0.1);
  }

  throw new ReceiptTooLargeError();
}