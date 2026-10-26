import { timingSafeEqual } from 'node:crypto';

import { config } from '../config.js';
import { BUSINESS_FLOWS, classifyBusinessFlow } from '../services/businessFlowClassifier.js';
import { analyzeCropImages } from '../services/cropAnalysisService.js';
import { analyzeStoreImages } from '../services/storeAnalysisService.js';

// Códigos de error que emite @fastify/multipart al superar los límites configurados.
const MULTIPART_LIMIT_ERROR_CODES = new Set([
  'FST_REQ_FILE_TOO_LARGE', // una imagen supera maxFileSizeBytes
  'FST_FILES_LIMIT', // se excede el número máximo de imágenes
]);

const validateApiKey = async (request, reply) => {
  const providedApiKey = request.headers['x-api-key'];

  if (!config.apiKey) {
    request.log.error('La variable de entorno API_KEY no está configurada.');
    return reply.code(500).send({
      error: 'InternalServerError',
      message: 'La autenticación de la API no está configurada.',
    });
  }

  if (
    typeof providedApiKey !== 'string' ||
    providedApiKey.length !== config.apiKey.length ||
    !timingSafeEqual(Buffer.from(providedApiKey), Buffer.from(config.apiKey))
  ) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key inválida o ausente.',
    });
  }
};

/**
 * Recorre las partes recibidas en la petición multipart: valida y carga las
 * imágenes en memoria y captura los campos `productType` y `specialObservations`.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<{ images: Array<{ filename: string, mimetype: string, buffer: Buffer }>, expectedProductType: string, specialObservations: string }>}
 * @throws {Error} con `statusCode` y `message` cuando una imagen no es válida o
 *   se superan los límites de subida.
 */
const collectMultipart = async (request) => {
  const images = [];
  let expectedProductType = '';
  let specialObservations = '';

  for await (const part of request.parts()) {
    if (part.type === 'field') {
      if (part.fieldname === 'productType' && typeof part.value === 'string') {
        expectedProductType = part.value.trim();
      }
      if (part.fieldname === 'specialObservations' && typeof part.value === 'string') {
        specialObservations = part.value.trim();
      }
      continue;
    }

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

  return { images, expectedProductType, specialObservations };
};

// Detalle del flujo tradicional (businessFlow = "traditional"); sin cambios respecto al original.
const traditionalDetailsSchema = {
  type: 'object',
  properties: {
    matchesExpectedProductType: { type: 'boolean' },
    estimatedMinimumRevenue: { type: 'number' },
    estimatedExpectedRevenue: { type: 'number' },
    estimatedMaximumRevenue: { type: 'number' },
    estimatedAverageTicket: { type: 'number' },
    estimatedInventoryValue: { type: 'number' },
    estimatedInventoryCoverageDays: { type: 'number' },
    estimatedMonthlyInventoryConsumptionPercentage: { type: 'number' },
    inventoryItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          subtotal: { type: 'number' },
        },
      },
    },
    estimatedWorkToolsValue: { type: 'number' },
    workTools: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          approximatePrice: { type: 'number' },
        },
      },
    },
    estimatedMonthlyExpenses: { type: 'number' },
    estimatedMonthlyProfit: { type: 'number' },
    productType: { type: 'string' },
    cleanlinessScore: { type: 'integer' },
    stockingScore: { type: 'integer' },
    organizationScore: { type: 'integer' },
    visibilityScore: { type: 'integer' },
    overallStoreScore: { type: 'integer' },
  },
};

// Detalle del flujo de cultivos (businessFlow = "crop").
const cropDetailsSchema = {
  type: 'object',
  // `required` permite al serializador distinguir este esquema del tradicional.
  required: ['mainSalesUnit'],
  properties: {
    mainSalesUnit: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    matchesExpectedProductType: { type: 'boolean' },
    cropType: { type: 'string' },
    productPresentation: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    recentProductionPrices: {
      type: 'object',
      properties: {
        minimum: { type: 'number' },
        maximum: { type: 'number' },
        average: { type: 'number' },
      },
    },
    harvestCycle: {
      type: 'object',
      properties: {
        minimumDays: { type: 'integer' },
        maximumDays: { type: 'integer' },
        description: { type: 'string' },
      },
    },
    careDetails: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          activity: { type: 'string' },
          description: { type: 'string' },
          frequency: { type: 'string' },
          estimatedCost: { type: 'number' },
        },
      },
    },
    minimumExpectedExpenses: { type: 'number' },
    expectedProduction: {
      type: 'object',
      properties: {
        minimum: { type: 'number' },
        maximum: { type: 'number' },
      },
    },
    localMarketHealth: {
      type: 'object',
      properties: {
        score: { type: 'integer' },
        status: { type: 'string' },
        description: { type: 'string' },
      },
    },
    riskPercentage: { type: 'integer' },
    riskFactors: { type: 'array', items: { type: 'string' } },
    plantHealthPercentage: { type: 'integer' },
    landCleanlinessPercentage: { type: 'integer' },
  },
};

// Esquema de la ruta (documentación OpenAPI y validación de la respuesta).
const analyzeSchema = {
  tags: ['analyze'],
  summary: 'Analiza una o varias imágenes de un establecimiento o cultivo con IA',
  description:
    'Recibe imágenes de un negocio. Primero se clasifica el flujo según el motivo del negocio ' +
    'y las imágenes: "traditional" (comercios y microemprendimientos, métricas comerciales) o ' +
    '"crop" (cultivos, métricas productivas y de mercado). El campo `businessFlow` indica el ' +
    'flujo aplicado y la forma de `details`.',
  consumes: ['multipart/form-data'],
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'boolean' },
        message: { type: 'string' },
        businessFlow: { type: 'string', enum: Object.values(BUSINESS_FLOWS) },
        details: {
          anyOf: [
            cropDetailsSchema,
            traditionalDetailsSchema,
          ],
        },
      },
    },
  },
};

export const analyzeRoutes = async (app) => {
  app.post(
    '/analyze',
    {
      schema: {
        ...analyzeSchema,
        security: [{ apiKey: [] }],
      },
      preHandler: validateApiKey,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'La petición debe ser multipart/form-data con imágenes.',
        });
      }

      let images;
      let expectedProductType;
      let specialObservations;

      try {
        ({ images, expectedProductType, specialObservations } = await collectMultipart(request));
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

      if (!expectedProductType) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Debe indicar el tipo de producto esperado en el campo "productType".',
        });
      }

      try {
        const { flow, reason } = await classifyBusinessFlow(
          images,
          expectedProductType,
          specialObservations
        );
        request.log.info({ businessFlow: flow, reason }, 'Flujo de análisis seleccionado');

        const analyze = flow === BUSINESS_FLOWS.CROP ? analyzeCropImages : analyzeStoreImages;
        const details = await analyze(images, expectedProductType, specialObservations);

        return reply.code(200).send({
          status: true,
          message: 'análisis completado exitosamente',
          businessFlow: flow,
          details,
        });
      } catch (err) {
        request.log.error(err);

        if (err.statusCode) {
          return reply.code(err.statusCode).send({
            status: false,
            message: err.message,
          });
        }

        return reply.code(502).send({
          status: false,
          message: 'No se pudo completar el análisis de las imágenes.',
        });
      }
    }
  );
};
