// src/services/cloudinary.js
// Updated: supports image AND video uploads, returns {url, thumbnailUrl}
import { CLOUDINARY } from '../constants';

/**
 * Upload media to Cloudinary
 * @param {string} uri - local file URI
 * @param {string} resourceType - 'image' or 'video'
 * @returns {Promise<{url: string, thumbnailUrl: string|null}>}
 */
export const uploadToCloudinary = async (uri, resourceType = 'image') => {
  try {
    const isVideo = resourceType === 'video';
    const ext = isVideo ? 'mp4' : 'jpg';
    const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
    const timestamp = Date.now();

    const formData = new FormData();
    formData.append('file', {
      uri,
      type: mimeType,
      name: `campusink_${timestamp}.${ext}`,
    });
    formData.append('upload_preset', CLOUDINARY.preset);
    formData.append('cloud_name', CLOUDINARY.cloud);

    // Cloudinary video URL uses /video/ instead of /image/
    const uploadUrl = isVideo
      ? `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloud}/video/upload`
      : CLOUDINARY.uploadUrl;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
    });

    const data = await res.json();
    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');

    // For videos, generate a thumbnail URL from Cloudinary's transformation API
    let thumbnailUrl = null;
    if (isVideo) {
      thumbnailUrl = data.secure_url
        .replace('/video/upload/', '/video/upload/so_0,w_400,h_400,c_fill/')
        .replace('.mp4', '.jpg');
    }

    return { url: data.secure_url, thumbnailUrl };
  } catch (error) {
    console.error('[Cloudinary] Upload error:', error);
    throw error;
  }
};

// Legacy alias for backward compatibility
export const uploadImage = async (imageUri) => {
  const result = await uploadToCloudinary(imageUri, 'image');
  return result.url;
};
