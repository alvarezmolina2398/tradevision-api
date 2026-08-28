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
- El usuario indicará un tipo de producto esperado. Debes verificar si las imágenes tienen relación \
con ese tipo de producto indicado:
  * matchesExpectedProductType: true si las imágenes muestran un establecimiento o productos \
relacionados con el tipo de producto indicado; false si no presentan ninguna relación.
  * Si no hay relación, aún así completa el resto de campos con tu mejor estimación, pero marca \
matchesExpectedProductType en false.
- Estima ingresos MENSUALES en la moneda de quetzales Guatemaltecos, considerando: cantidad de productos \
visibles, nivel de abastecimiento, diversidad de productos, capacidad comercial, tamaño aparente \
del local, el tipo de negocio y además ten en cuenta que los negocios se encuentran en Aldeas o Municipios (no lugares urbanos).
- Para estimar los precios y los ingresos, considera además las condiciones de producción y del \
mercado en Guatemala: costos de producción locales, disponibilidad y precios de los productos \
producidos en el país, temporadas de producción y el poder adquisitivo típico de la zona.
- estimatedMinimumRevenue: escenario conservador (mínimo probable).
- estimatedExpectedRevenue: escenario más probable.
- estimatedMaximumRevenue: escenario optimista bajo condiciones favorables.
- Debe cumplirse: estimatedMinimumRevenue <= estimatedExpectedRevenue <= estimatedMaximumRevenue.
- estimatedAverageTicket: monto promedio especulativo de una venta o transacción, expresado en \
quetzales Guatemaltecos. Estímalo según el tipo de negocio, la mezcla y precios de los productos \
visibles, y el poder adquisitivo típico de Aldeas o Municipios de Guatemala. Debe ser mayor o igual a 0.
- estimatedInventoryValue: valor monetario aproximado del inventario (mercancía) visible en las \
imágenes, expresado en quetzales Guatemaltecos. Estima de forma prudente el valor total de los \
artículos observados en estantes, vitrinas y exhibidores, considerando los precios locales de mercado.
- inventoryItems: listado de los artículos o grupos de productos que tomaste en cuenta para calcular \
estimatedInventoryValue. Para cada artículo incluye: name (nombre o categoría del producto), \
quantity (cantidad aproximada de unidades observadas), unitPrice (precio unitario estimado en \
quetzales) y subtotal (valor total del artículo, es decir quantity por unitPrice). La suma de los \
subtotal debe aproximarse a estimatedInventoryValue.
- estimatedWorkToolsValue: valor monetario aproximado total de los instrumentos de trabajo visibles \
en las imágenes, expresado en quetzales Guatemaltecos. Incluye equipo, herramientas y utensilios \
usados para operar el negocio, pero no mercancía destinada a la venta.
- workTools: listado de los instrumentos de trabajo considerados para calcular estimatedWorkToolsValue. \
Para cada uno incluye: description (descripción breve del instrumento visible), quantity (cantidad \
aproximada observada), unitPrice (precio unitario aproximado en quetzales) y approximatePrice \
(valor aproximado total, calculado como quantity por unitPrice). La suma de approximatePrice debe aproximarse a \
estimatedWorkToolsValue. Si no se observan instrumentos de trabajo, devuelve \
estimatedWorkToolsValue en 0 y workTools como un arreglo vacío.
- estimatedMonthlyExpenses: gastos MENSUALES estimados que debería tener el negocio en quetzales \
Guatemaltecos (costo de mercancía/reabastecimiento, renta, servicios, salarios u otros gastos \
operativos típicos según el tipo y tamaño del negocio observado).
- estimatedMonthlyProfit: utilidad MENSUAL estimada en quetzales Guatemaltecos, calculada como \
estimatedExpectedRevenue menos estimatedMonthlyExpenses. Puede ser negativa si los gastos superan \
los ingresos esperados.
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
    'matchesExpectedProductType',
    'estimatedMinimumRevenue',
    'estimatedExpectedRevenue',
    'estimatedMaximumRevenue',
    'estimatedAverageTicket',
    'estimatedInventoryValue',
    'inventoryItems',
    'estimatedWorkToolsValue',
    'workTools',
    'estimatedMonthlyExpenses',
    'estimatedMonthlyProfit',
    'productType',
    'cleanlinessScore',
    'stockingScore',
    'organizationScore',
    'visibilityScore',
    'overallStoreScore',
  ],
  properties: {
    matchesExpectedProductType: { type: 'boolean' },
    estimatedMinimumRevenue: { type: 'number' },
    estimatedExpectedRevenue: { type: 'number' },
    estimatedMaximumRevenue: { type: 'number' },
    estimatedAverageTicket: { type: 'number', minimum: 0 },
    estimatedInventoryValue: { type: 'number', minimum: 0 },
    inventoryItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unitPrice', 'subtotal'],
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number', minimum: 0 },
          unitPrice: { type: 'number', minimum: 0 },
          subtotal: { type: 'number', minimum: 0 },
        },
      },
    },
    estimatedWorkToolsValue: { type: 'number', minimum: 0 },
    workTools: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unitPrice', 'approximatePrice'],
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number', minimum: 0 },
          unitPrice: { type: 'number', minimum: 0 },
          approximatePrice: { type: 'number', minimum: 0 },
        },
      },
    },
    estimatedMonthlyExpenses: { type: 'number' },
    estimatedMonthlyProfit: { type: 'number' },
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
 * @param {string} expectedProductType tipo de producto esperado para las imágenes
 * @returns {Promise<object>} details con las métricas del análisis
 * @throws {Error} con `statusCode` 422 cuando las imágenes no tienen relación
 *   con el tipo de producto indicado.
 */
export const analyzeStoreImages = async (images, expectedProductType) => {
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
            text: `El tipo de producto esperado es: "${expectedProductType}". Analiza el establecimiento mostrado en estas ${images.length} imagen(es), verifica si tienen relación con ese tipo de producto y devuelve las métricas comerciales.`,
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

  const details = JSON.parse(content);

  if (details.matchesExpectedProductType === false) {
    throw Object.assign(
      new Error(
        `Las imágenes no presentan relación con el tipo de producto indicado: "${expectedProductType}".`
      ),
      { statusCode: 422, errorName: 'ProductTypeMismatch' }
    );
  }

  return details;
};
