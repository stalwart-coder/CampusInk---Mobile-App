// src/services/imageGeneration.js

export const generateImage = async (prompt) => {
  try {
    const cleanPrompt = prompt
      .replace(/generate image|create image|make image|draw|image of|image banao|tasveer|photo of|picture of/gi, '')
      .trim() || prompt;

    const seed = Math.floor(Math.random() * 999999);
    const encoded = encodeURIComponent(`${cleanPrompt}, high quality, detailed, beautiful, 4k`);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}&enhance=true`;
    return url;
  } catch (error) {
    throw error;
  }
};
