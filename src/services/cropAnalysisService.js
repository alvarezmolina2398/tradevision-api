import { config } from '../config.js';
import { getOpenAIClient } from './openaiClient.js';

/**
 * Rol del agente: experto agrónomo y en comercialización de cultivos en Guatemala.
 */
const SYSTEM_PROMPT = `Eres un agente experto en agronomía y en la comercialización de productos \
agrícolas de pequeños productores en Aldeas y Municipios de Guatemala. Tu tarea es analizar \
visualmente un cultivo a partir de una o varias imágenes y estimar su potencial productivo y comercial.

Reglas de análisis:
- Basa las conclusiones sobre el estado físico del cultivo y del terreno únicamente en lo visible en las imágenes.
- Usa las observaciones especiales como contexto adicional (extensión del terreno, número de plantas, \
acceso, clima, riego, etapa del cultivo, etc.) para ajustar las estimaciones. No presentes ese contexto \
como algo visible en las imágenes ni permitas que sustituya la evidencia visual.
- El usuario indicará un tipo de producto esperado. Verifica si las imágenes tienen relación con ese cultivo:
  * matchesExpectedProductType: true si las imágenes muestran el cultivo indicado o uno claramente \
relacionado; false si no presentan ninguna relación. Si no hay relación, aún así completa el resto de \
campos con tu mejor estimación.
- cropType: nombre del cultivo identificado (por ejemplo "Maíz", "Café", "Caña de azúcar", "Tomate").
- productPresentation: formato comercial del producto agrícola que se venderá. Analiza si el usuario \
especificó una presentación en productType o specialObservations (por ejemplo café maduro/cereza, \
café pergamino, caña fresca, panela o azúcar) y respétala. No confundas el cultivo con su presentación: \
cropType identifica el cultivo y productPresentation identifica el estado o producto comercial.
  * Si no se indicó una presentación, selecciona la forma más común de venta minorista para ese \
producto en mercados rurales de Guatemala. Si hay varias presentaciones comunes, elige una y deja \
claro en description que fue una selección estimada por falta de especificación.
  * name: nombre claro de la presentación. description: indica si fue indicada por el usuario o \
seleccionada como la más común, y cualquier aclaración relevante sobre procesamiento.
- mainSalesUnit: unidad de venta principal con la que se comercializa este producto en el mercado local \
de Guatemala en la productPresentation seleccionada (por ejemplo quintal, arroba, libra, caja, costal, \
red, ciento, docena, manojo, bolsa o panela/unidad). \
* Elige una unidad comercial estándar, habitual y estable para ese cultivo y presentación en el \
mercado local. Prefiere unidades de peso fijas cuando sean habituales (por ejemplo, quintal de \
100 libras para granos); no uses sacos, cajas, redes o manojos de contenido variable como si \
tuvieran un tamaño universal. Si una presentación comercial local requiere una de esas unidades, \
aclara su contenido o equivalencia en description. \
* name: nombre de la unidad. description: equivalencia fija o aclaración (por ejemplo "100 libras"). \
* Mantén exactamente la misma unidad y presentación en expectedProduction y recentProductionPrices; \
no calcules un campo por libra o kilogramo si mainSalesUnit indica quintal, por ejemplo.
- recentProductionPrices: precio aproximado de VENTA AL POR MENOR del producto en la \
productPresentation elegida, al consumidor final en zonas \
rurales de Guatemala. minimum, maximum y average deben expresarse en QUETZALES (GTQ) POR UNA \
UNIDAD COMPLETA de mainSalesUnit; por ejemplo, si mainSalesUnit es un quintal de 100 libras, \
cada importe es el precio de venta minorista del quintal completo de esa productPresentation, no \
el precio por libra ni por kilogramo. Basa minimum, maximum y average en esa misma unidad estándar \
y presentación; comprueba esa correspondencia antes de responder. Estima el precio minorista local \
incluyendo el margen normal del comercio y costos de distribución cuando corresponda. \
  * Puedes usar precios del año calendario anterior como referencia histórica para estimar el \
precio minorista, siempre considerando el producto, la unidad, la zona y la temporada comparables \
y ajustando prudentemente por cambios de mercado y estacionalidad. Un precio del año anterior es \
solo una referencia, no una cotización actual. \
  * No afirmes haber consultado precios actuales o históricos ni presentes cifras como datos \
verificados: este análisis no tiene acceso a una fuente externa de precios en tiempo real. Si no \
hay una referencia fiable disponible en el contexto, proporciona una estimación prudente. \
  * NO devuelvas precio pagado al productor, precio mayorista ni precio a granel salvo que esa \
sea la forma normal de venta minorista de ese producto en la zona. \
Debe cumplirse minimum <= average <= maximum.
- harvestCycle: tiempo estimado entre ciclos de cosecha del cultivo en días (minimumDays <= maximumDays) \
y una description breve (por ejemplo ciclos por año, si es cosecha continua o anual).
- careDetails: listado de los cuidados necesarios por cada cosecha (preparación del terreno, siembra, \
fertilización, control de plagas y enfermedades, riego, limpias/deshierbe, cosecha, poscosecha, etc.). \
Para cada uno incluye: activity (nombre del cuidado), description (en qué consiste y cuándo se realiza), \
frequency (frecuencia o número de veces por ciclo) y estimatedCost (costo aproximado por ciclo en quetzales, \
mayor o igual a 0).
- minimumExpectedExpenses: gastos MÍNIMOS esperados por ciclo de cosecha en quetzales guatemaltecos \
(insumos, mano de obra, transporte, etc.) para la extensión de cultivo observada o indicada. \
Debe ser coherente con la suma de estimatedCost de careDetails.
- expectedProduction: cantidad mínima (minimum) y máxima esperada por ciclo de cosecha, expresada \
en mainSalesUnit y en la productPresentation indicada. Considera la extensión visible o indicada, \
la densidad y el estado de las plantas; si la presentación requiere procesamiento (por ejemplo, \
transformar caña en panela o café maduro en pergamino), estima el producto resultante y considera \
prudencialmente el rendimiento de transformación. No presentes la cantidad de cultivo cosechado \
como si fuera cantidad de producto procesado. Debe cumplirse minimum <= maximum.
- localMarketHealth: salud del producto en el mercado local de Guatemala (demanda, estabilidad de precios, \
competencia, estacionalidad, facilidad de venta):
  * score: entero de 0 a 100 (100 = mercado muy favorable).
  * status: una de "muy favorable", "favorable", "estable", "desfavorable", "muy desfavorable".
  * description: justificación breve.
- riskPercentage: entero de 0 a 100 con el riesgo global de la inversión/producción (clima, plagas, \
enfermedades, volatilidad de precios, estado del cultivo, acceso al mercado). 100 = riesgo máximo.
- riskFactors: listado breve de los principales factores de riesgo identificados.
- plantHealthPercentage: entero de 0 a 100 con la salud de las plantas mostradas (color, vigor, \
presencia de plagas, enfermedades, marchitez o deficiencias nutricionales).
- landCleanlinessPercentage: entero de 0 a 100 con la limpieza del terreno (ausencia de maleza, \
basura, rastrojos sin manejar y orden del cultivo).
- Sé objetivo y coherente. Si la imagen no permite evaluar una métrica, estima de forma prudente.
- Responde SIEMPRE en español en los campos de texto.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mainSalesUnit',
    'matchesExpectedProductType',
    'cropType',
    'productPresentation',
    'recentProductionPrices',
    'harvestCycle',
    'careDetails',
    'minimumExpectedExpenses',
    'expectedProduction',
    'localMarketHealth',
    'riskPercentage',
    'riskFactors',
    'plantHealthPercentage',
    'landCleanlinessPercentage',
  ],
  properties: {
    mainSalesUnit: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'description'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    matchesExpectedProductType: { type: 'boolean' },
    cropType: { type: 'string' },
    productPresentation: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'description'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    recentProductionPrices: {
      type: 'object',
      additionalProperties: false,
      required: ['minimum', 'maximum', 'average'],
      properties: {
        minimum: { type: 'number', minimum: 0 },
        maximum: { type: 'number', minimum: 0 },
        average: { type: 'number', minimum: 0 },
      },
    },
    harvestCycle: {
      type: 'object',
      additionalProperties: false,
      required: ['minimumDays', 'maximumDays', 'description'],
      properties: {
        minimumDays: { type: 'integer', minimum: 0 },
        maximumDays: { type: 'integer', minimum: 0 },
        description: { type: 'string' },
      },
    },
    careDetails: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['activity', 'description', 'frequency', 'estimatedCost'],
        properties: {
          activity: { type: 'string' },
          description: { type: 'string' },
          frequency: { type: 'string' },
          estimatedCost: { type: 'number', minimum: 0 },
        },
      },
    },
    minimumExpectedExpenses: { type: 'number', minimum: 0 },
    expectedProduction: {
      type: 'object',
      additionalProperties: false,
      required: ['minimum', 'maximum'],
      properties: {
        minimum: { type: 'number', minimum: 0 },
        maximum: { type: 'number', minimum: 0 },
      },
    },
    localMarketHealth: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'status', 'description'],
      properties: {
        score: { type: 'integer', minimum: 0, maximum: 100 },
        status: {
          type: 'string',
          enum: ['muy favorable', 'favorable', 'estable', 'desfavorable', 'muy desfavorable'],
        },
        description: { type: 'string' },
      },
    },
    riskPercentage: { type: 'integer', minimum: 0, maximum: 100 },
    riskFactors: { type: 'array', items: { type: 'string' } },
    plantHealthPercentage: { type: 'integer', minimum: 0, maximum: 100 },
    landCleanlinessPercentage: { type: 'integer', minimum: 0, maximum: 100 },
  },
};

const toDataUrl = ({ buffer, mimetype }) =>
  `data:${mimetype};base64,${buffer.toString('base64')}`;

/**
 * Analiza una o varias imágenes de un cultivo y devuelve su potencial
 * productivo y comercial.
 *
 * @param {Array<{ buffer: Buffer, mimetype: string }>} images
 * @param {string} expectedProductType cultivo esperado en las imágenes
 * @param {string} [specialObservations] contexto adicional (extensión, riego, clima, etc.)
 * @returns {Promise<object>} details con las métricas del cultivo
 * @throws {Error} con `statusCode` 422 cuando las imágenes no tienen relación
 *   con el tipo de producto indicado.
 */
export const analyzeCropImages = async (images, expectedProductType, specialObservations = '') => {
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
            text: `El tipo de producto (cultivo) esperado es: "${expectedProductType}".\nObservaciones especiales proporcionadas por el usuario: ${specialObservations || 'Ninguna.'}\nAnaliza el cultivo mostrado en estas ${images.length} imagen(es), verifica si tienen relación con el cultivo esperado y devuelve las métricas productivas y comerciales. Considera las observaciones al estimar, sin tratarlas como evidencia visual.`,
          },
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: toDataUrl(image) },
          })),
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'crop_analysis',
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
