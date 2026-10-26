import { config } from '../config.js';
import { getOpenAIClient } from './openaiClient.js';

export const BUSINESS_FLOWS = Object.freeze({
  TRADITIONAL: 'traditional',
  CROP: 'crop',
});

const SYSTEM_PROMPT = `Eres un clasificador de actividades económicas de microemprendimientos en Guatemala. \
Debes decidir qué flujo de análisis corresponde a la solicitud, considerando el motivo del negocio \
indicado por el usuario y lo que muestran las imágenes.

Flujos posibles:
- "crop": la actividad es la PRODUCCIÓN agrícola de un cultivo (siembras, milpas, cafetales, \
hortalizas, frutales, invernaderos, viveros, parcelas o terrenos sembrados, plantas en crecimiento). \
Elige este flujo si el motivo del negocio describe un cultivo/siembra o si las imágenes muestran \
principalmente plantas cultivadas o un terreno agrícola.
- "traditional": cualquier otro negocio comercial o de servicios (tiendas, abarrotes, puestos de \
mercado, comedores, talleres, etc.). Un local que solo REVENDE productos agrícolas (verdulería, \
venta de granos en un puesto) es "traditional", no "crop".

Si el motivo y las imágenes se contradicen, prioriza lo que muestran las imágenes. \
Responde con un motivo breve en español.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['flow', 'reason'],
  properties: {
    flow: { type: 'string', enum: Object.values(BUSINESS_FLOWS) },
    reason: { type: 'string' },
  },
};

const toDataUrl = ({ buffer, mimetype }) =>
  `data:${mimetype};base64,${buffer.toString('base64')}`;

/**
 * Determina si la solicitud corresponde a un negocio tradicional o a un cultivo.
 *
 * @param {Array<{ buffer: Buffer, mimetype: string }>} images
 * @param {string} expectedProductType motivo / tipo de negocio indicado por el usuario
 * @param {string} [specialObservations]
 * @returns {Promise<{ flow: 'traditional' | 'crop', reason: string }>}
 */
export const classifyBusinessFlow = async (images, expectedProductType, specialObservations = '') => {
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Motivo / tipo de negocio indicado: "${expectedProductType}".\nObservaciones especiales: ${specialObservations || 'Ninguna.'}\nClasifica el flujo de análisis según el motivo y las ${images.length} imagen(es).`,
          },
          // Detalle bajo: basta para clasificar y reduce costo/latencia.
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: toDataUrl(image), detail: 'low' },
          })),
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'business_flow_classification',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('El modelo no devolvió una clasificación válida.');
  }

  return JSON.parse(content);
};
