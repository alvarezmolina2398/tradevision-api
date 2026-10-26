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
- Basa las conclusiones sobre el estado físico del establecimiento únicamente en lo visible en las imágenes.
- Usa las observaciones especiales como contexto adicional para ajustar las estimaciones comerciales que dependan de ellas, como ubicación, acceso o condiciones del terreno. No presentes ese contexto como algo visible en las imágenes ni permitas que sustituya la evidencia visual.
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
- Para estimar la rotación del inventario, toma en cuenta conjuntamente productType, \
estimatedAverageTicket, estimatedExpectedRevenue, la mezcla/cantidades de productos visibles y lo \
que normalmente vende ese giro. Ajusta el volumen de ventas y transacciones al tamaño de un \
micronegocio o negocio pequeño ubicado en una aldea o municipio de Guatemala; no uses como referencia \
el flujo de clientes o las ventas de un comercio urbano grande. Usa estimatedExpectedRevenue como \
venta mensual esperada y estimatedAverageTicket para comprobar cuántas transacciones mensuales \
implicaría ese nivel de venta y si resulta razonable para ese negocio rural.
- estimatedInventoryCoverageDays: días aproximados que rendiría el inventario visible al ritmo de \
consumo mensual estimado para ese giro y tamaño de negocio. Calcula la cobertura usando el valor de \
venta estimado del inventario visible frente a la venta mensual esperada de los productos que \
provienen de ese inventario, con un mes de 30 días: estimatedInventoryCoverageDays = \
(estimatedInventoryValue / venta mensual atribuible a ese inventario) * 30. Si el giro mezcla \
servicios y productos, considera solo la parte de ventas atribuible a productos; no cuentes servicios \
como consumo de inventario. Si no se observa inventario vendible o su valor es 0, devuelve 0. \
Debe ser mayor o igual a 0.
- estimatedMonthlyInventoryConsumptionPercentage: porcentaje del inventario visible que se \
consumiría en un mes típico. Este campo se calcula automáticamente a partir de \
estimatedInventoryCoverageDays usando un mes de 30 días: (30 / días de cobertura) * 100. Puede \
superar 100 si el inventario dura menos de 30 días. Si no se observa inventario vendible o la \
cobertura es 0, devuelve 0. Debe ser mayor o igual a 0.
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
    'estimatedInventoryCoverageDays',
    'estimatedMonthlyInventoryConsumptionPercentage',
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
    estimatedInventoryCoverageDays: { type: 'number', minimum: 0 },
    estimatedMonthlyInventoryConsumptionPercentage: { type: 'number', minimum: 0 },
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
 * @param {string} [specialObservations] contexto adicional sobre el terreno o la ubicación
 * @returns {Promise<object>} details con las métricas del análisis
 * @throws {Error} con `statusCode` 422 cuando las imágenes no tienen relación
 *   con el tipo de producto indicado.
 */
export const analyzeStoreImages = async (images, expectedProductType, specialObservations = '') => {
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
            text: `El tipo de producto esperado es: "${expectedProductType}".\nObservaciones especiales proporcionadas por el usuario: ${specialObservations || 'Ninguna.'}\nAnaliza el establecimiento mostrado en estas ${images.length} imagen(es), verifica si tienen relación con el tipo de producto esperado y devuelve las métricas comerciales. Considera las observaciones al estimar el impacto comercial del contexto, sin tratarlas como evidencia visual.`,
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

  details.estimatedMonthlyInventoryConsumptionPercentage =
    details.estimatedInventoryCoverageDays > 0
      ? (30 / details.estimatedInventoryCoverageDays) * 100
      : 0;

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
