import { config } from '../config.js';
import { analyzeStoreImages } from '../services/storeAnalysisService.js';

// Códigos de error que emite @fastify/multipart al superar los límites configurados.
const MULTIPART_LIMIT_ERROR_CODES = new Set([
  'FST_REQ_FILE_TOO_LARGE', // una imagen supera maxFileSizeBytes
  'FST_FILES_LIMIT', // se excede el número máximo de imágenes
]);

/**
 * Recorre las imágenes recibidas en la petición multipart, valida su tipo MIME
 * y las carga en memoria.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<Array<{ filename: string, mimetype: string, buffer: Buffer }>>}
 * @throws {Error} con `statusCode` y `message` cuando una imagen no es válida o
 *   se superan los límites de subida.
 */
const collectImages = async (request) => {
  const images = [];

  for await (const part of request.files()) {
    if (!config.upload.allowedMimeTypes.includes(part.mimetype)) {
      throw Object.assign(new Error(`Tipo de archivo no permitido: ${part.mimetype}`), {
        statusCode: 415,
        errorName: 'UnsupportedMediaType',
      });
    }

    images.push({
      filename: part.filename,
      mimetype: part.mimetype,
      buffer: await part.toBuffer(),
    });
  }

  return images;
};

// Esquema de la ruta (documentación OpenAPI y validación de la respuesta).
const analyzeSchema = {
  tags: ['analyze'],
  summary: 'Analiza una o varias imágenes de un establecimiento con IA',
  description:
    'Recibe imágenes de un negocio y un agente experto en comercios y ' +
    'microemprendimientos estima métricas comerciales a partir del análisis visual.',
  consumes: ['multipart/form-data'],
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'boolean' },
        message: { type: 'string' },
        details: {
          type: 'object',
          properties: {
            estimatedMinimumRevenue: { type: 'number' },
            estimatedExpectedRevenue: { type: 'number' },
            estimatedMaximumRevenue: { type: 'number' },
            productType: { type: 'string' },
            cleanlinessScore: { type: 'integer' },
            stockingScore: { type: 'integer' },
            organizationScore: { type: 'integer' },
            visibilityScore: { type: 'integer' },
            overallStoreScore: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const analyzeRoutes = async (app) => {
  app.post(
    '/analyze',
    { schema: analyzeSchema },
    async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'La petición debe ser multipart/form-data con imágenes.',
        });
      }

      let images;

      try {
        images = await collectImages(request);
      } catch (err) {
        request.log.error(err);

        if (MULTIPART_LIMIT_ERROR_CODES.has(err.code)) {
          return reply.code(413).send({
            error: 'PayloadTooLarge',
            message:
              'Alguna imagen supera el tamaño máximo permitido o se excedió el número de archivos.',
          });
        }

        if (err.statusCode) {
          return reply.code(err.statusCode).send({
            error: err.errorName ?? 'BadRequest',
            message: err.message,
          });
        }

        return reply.code(400).send({
          error: 'BadRequest',
          message: 'No se pudieron procesar las imágenes enviadas.',
        });
      }

      if (images.length === 0) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'No se recibió ninguna imagen.',
        });
      }

      try {
        const details = await analyzeStoreImages(images);

        return reply.code(200).send({
          status: true,
          message: 'análisis completado exitosamente',
          details,
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(502).send({
          status: false,
          message: 'No se pudo completar el análisis de las imágenes.',
        });
      }
    }
  );
};
