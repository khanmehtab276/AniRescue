/**
 * Uploads an image file directly to Cloudinary (unsigned upload preset)
 * and returns the resulting secure_url.
 *
 * Extracted from ReportCase.jsx so the same upload path can be reused
 * for rescue-evidence photos without duplicating the fetch/error logic.
 */
export async function uploadImageToCloudinary(imageFile) {
  const cloudinaryData = new FormData();

  cloudinaryData.append('file', imageFile);
  cloudinaryData.append('upload_preset', 'anirescue_uploads');

  const cloudRes = await fetch(
    'https://api.cloudinary.com/v1_1/tsacc3bn/image/upload',
    {
      method: 'POST',
      body: cloudinaryData
    }
  );

  const cloudData = await cloudRes.json();

  if (!cloudRes.ok) {
    throw new Error(
      cloudData.error?.message || 'Cloudinary image upload failed.'
    );
  }

  if (!cloudData.secure_url) {
    throw new Error('Cloudinary did not return an image URL.');
  }

  return cloudData.secure_url;
}
