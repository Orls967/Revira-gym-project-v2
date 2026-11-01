// Path: member-app/src/lib/image.ts
import * as ImageManipulator from 'expo-image-manipulator';

export async function compressPaymentReceipt(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  
  return result.uri;
}