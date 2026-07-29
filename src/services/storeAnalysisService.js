import { config } from '../config.js';
import { getOpenAIClient } from './openaiClient.js';

/**
 * Rol del agente: experto en comercios y microemprendimientos.
 * Analiza visualmente el establecimiento a partir de las imágenes recibidas.
 */
const SYSTEM_PROMPT = `Eres un agente experto en comercios y microemprendimientos (tiendas de barrio, \
abarrotes, changarros, puestos de mercado y pequeños negocios). Tu tarea es analizar visualmente \
un establecimiento a partir de una o varias imágenes y estimar su desempeño comercial.

Reglas de análisis:
- Basa TODAS tus conclusiones únicamente en lo que es visible en las imágenes.
- Estima ingresos MENSUALES en la moneda de quetzales Guatemaltecos, considerando: cantidad de productos \
visibles, nivel de abastecimiento, diversidad de productos, capacidad comercial, tamaño aparente \
del local y el tipo de negocio.
- estimatedMinimumRevenue: escenario conservador (mínimo probable).
- estimatedExpectedRevenue: escenario más probable.
- estimatedMaximumRevenue: escenario optimista bajo condiciones favorables.
- Debe cumplirse: estimatedMinimumRevenue <= estimatedExpectedRevenue <= estimatedMaximumRevenue.
- productType: clasificación breve del tipo de negocio o actividad comercial observada.
- Los "score" son enteros de 0 a 100:
  * cleanlinessScore: limpieza y mantenimiento visible (pisos, estanterías, superficies).
  * stockingScore: nivel de abastecimiento (ocupación de estantes / cantidad de productos).
  * organizationScore: orden, alineación y clasificación de los productos.
  * visibilityScore: visibilidad y accesibilidad de productos (iluminación, disposición, obstrucciones).
  * overallStoreScore: evaluación general ponderada de las métricas anteriores.
- Sé objetivo y coherente. Si la imagen no permite evaluar una métrica, estima de forma prudente.
- Responde SIEMPRE en español en los campos de texto.`;

/**
 * JSON Schema que garantiza la estructura exacta de la respuesta del modelo.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'estimatedMinimumRevenue',
    'estimatedExpectedRevenue',
    'estimatedMaximumRevenue',
    'productType',
    'cleanlinessScore',
    'stockingScore',
    'organizationScore',
    'visibilityScore',
    'overallStoreScore',
  ],
  properties: {
    estimatedMinimumRevenue: { type: 'number' },
    estimatedExpectedRevenue: { type: 'number' },
    estimatedMaximumRevenue: { type: 'number' },
    productType: { type: 'string' },
    cleanlinessScore: { type: 'integer', minimum: 0, maximum: 100 },
    stockingScore: { type: 'integer', minimum: 0, maximum: 100 },
    organizationScore: { type: 'integer', minimum: 0, maximum: 100 },
    visibilityScore: { type: 'integer', minimum: 0, maximum: 100 },
    overallStoreScore: { type: 'integer', minimum: 0, maximum: 100 },
  },
};

/**
 * Convierte una imagen (buffer + mimetype) en un data URL base64.
 */
const toDataUrl = ({ buffer, mimetype }) =>
  `data:${mimetype};base64,${buffer.toString('base64')}`;

/**
 * Analiza una o varias imágenes de un establecimiento con el agente experto
 * y devuelve las métricas comerciales estimadas.
 *
 * @param {Array<{ buffer: Buffer, mimetype: string }>} images
 * @returns {Promise<object>} details con las métricas del análisis
 */
export const analyzeStoreImages = async (images) => {
  const openai = getOpenAIClient();

  const imageContent = images.map((image) => ({
    type: 'image_url',
    image_url: { url: toDataUrl(image) },
  }));

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analiza el establecimiento mostrado en estas ${images.length} imagen(es) y devuelve las métricas comerciales.`,
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'store_analysis',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('El modelo no devolvió un análisis válido.');
  }

  return JSON.parse(content);
};
