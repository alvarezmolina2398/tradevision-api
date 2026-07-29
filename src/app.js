import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { analyzeRoutes } from './routes/analyze.js';

export const buildApp = async (options = {}) => {
  const app = Fastify({
    logger: true,
    ...options,
  });

  // CORS abierto para todos los orígenes y métodos
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Documentación OpenAPI/Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'TradeVision API',
        description: 'API para análisis de imágenes',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Estado del servicio' },
        { name: 'analyze', description: 'Análisis de imágenes' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Soporte para multipart/form-data (subida de imágenes)
  app.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSizeBytes,
      files: config.upload.maxFiles,
    },
  });

  // Rutas
  app.register(healthRoutes);
  app.register(analyzeRoutes);

  return app;
}
