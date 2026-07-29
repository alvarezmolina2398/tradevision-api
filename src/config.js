import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  // Límites para la subida de imágenes
  upload: {
    maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10 MB por imagen
    maxFiles: Number(process.env.MAX_FILES) || 10, // máximo de imágenes por petición
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  // Configuración del servicio de OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
};
