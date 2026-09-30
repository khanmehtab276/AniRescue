import API from './api.js';

/**
 * Upload an image using a short-lived, server-generated Cloudinary
 * signature. The Cloudinary API secret never reaches browser code.
 */
export async function uploadImageToCloudinary(imageFile) {
  if (!(imageFile instanceof File)) {
    throw new Error('A valid image file is required.');
  }

  if (!imageFile.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded.');
  }

  if (imageFile.size > 10 * 1024 * 1024) {
    throw new Error('Image must be 10 MB or smaller.');
  }

  const signatureResponse = await API.post('/cases/upload-signature');
  const {
    cloudName,
    apiKey,
    timestamp,
    signature,
    resourceType = 'image',
  } = signatureResponse.data || {};

  if (!cloudName || !apiKey || !timestamp || !signature) {
    throw new Error('Image upload authorization could not be created.');
  }

  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || 'Cloudinary image upload failed.',
    );
  }

  if (!data.secure_url) {
    throw new Error('Cloudinary did not return an image URL.');
  }

  return data.secure_url;
}
