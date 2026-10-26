# Nuevo flujo de análisis de cultivos

## Propósito

El endpoint `POST /analyze` ahora admite dos tipos de análisis dentro de la misma API:

- **Flujo tradicional (`traditional`)**: comercios y microemprendimientos, como tiendas, puestos de mercado, comedores o talleres. Conserva las métricas comerciales existentes.
- **Flujo de cultivos (`crop`)**: producción agrícola, como parcelas, milpas, cafetales, hortalizas, frutales, viveros o invernaderos. Estima métricas productivas, agronómicas y de mercado.

La API selecciona automática
mente el flujo según el motivo del negocio indicado en `productType` y las imágenes recibidas. No se añade un endpoint separado.

## Datos de entrada

La solicitud mantiene el formato `multipart/form-data` y los mismos campos:

| Campo | Obligatorio | Uso |
|---|---:|---|
| `productType` | Sí | Motivo del negocio o cultivo que se desea analizar. |
| `specialObservations` | No | Contexto adicional que ayude a ajustar las estimaciones. |
| `images` | Sí | Una o varias imágenes del negocio o cultivo. |

Para el flujo de cultivos, conviene especificar en `specialObservations` datos que no siempre se pueden deducir de una fotografía, como la extensión sembrada, cantidad de plantas, disponibilidad de riego, etapa del cultivo o condiciones de acceso.

## Cómo se selecciona el flujo

Antes del análisis se ejecuta una clasificación con IA que considera `productType`, las observaciones y las imágenes:

- Se selecciona `crop` cuando el negocio consiste en **producir** cultivos o las imágenes muestran principalmente plantas cultivadas o terreno agrícola.
- Se selecciona `traditional` para otros negocios comerciales o de servicios.
- Un comercio que solo revende productos agrícolas, como una verdulería o un puesto de granos, se considera `traditional`.
- Si el motivo declarado contradice lo que muestran las imágenes, la clasificación da prioridad a las imágenes.

La respuesta exitosa indica la selección en la propiedad de nivel superior `businessFlow`. Su valor es `traditional` o `crop`; el cliente debe usarlo para interpretar la estructura de `details`.

## Qué mide el flujo de cultivos

El flujo devuelve las siguientes métricas dentro de `details`:

| Campo | Qué representa |
|---|---|
| `mainSalesUnit` | Unidad comercial estándar y habitual para el cultivo y la presentación en el mercado local, por ejemplo quintal, arroba o libra. Incluye `name` y `description` con una equivalencia fija o aclaración; evita empaques de contenido variable salvo que se especifique su contenido. Las cantidades producidas y los precios por unidad se expresan en esta medida. |
| `matchesExpectedProductType` | Indica si las imágenes tienen relación con el cultivo indicado en `productType`. Si es `false`, la solicitud termina con error HTTP `422`. |
| `cropType` | Nombre del cultivo identificado, por ejemplo café, caña de azúcar o maíz. |
| `productPresentation` | Formato comercial al que se refieren los precios y la producción, por ejemplo café maduro/cereza, café pergamino, caña fresca, panela o azúcar. Si el usuario lo especifica en `productType` o `specialObservations`, se respeta; si no, se elige la presentación estimada más común en la venta minorista rural y se explica en `description`. |
| `recentProductionPrices` | Precio aproximado de venta al por menor al consumidor final en zonas rurales de Guatemala. `minimum`, `maximum` y `average` son quetzales (GTQ) por una unidad completa de `mainSalesUnit` y por la presentación indicada en `productPresentation` (por ejemplo, Q por quintal de 100 lb de café pergamino), nunca por una unidad de peso diferente. Precios del año calendario anterior pueden usarse como referencia histórica si son comparables por producto, presentación, unidad, zona y temporada; no deben presentarse como cotización actual verificada. No representa precio pagado al productor ni precio mayorista, excepto cuando esa sea la forma habitual de venta minorista del producto en la zona. |
| `harvestCycle` | Tiempo estimado entre cosechas, en días: `minimumDays`, `maximumDays` y una descripción sobre el ciclo. |
| `careDetails` | Cuidados estimados por ciclo, como preparación del terreno, siembra, fertilización, control de plagas, riego, deshierbe, cosecha o poscosecha. Cada elemento incluye actividad, descripción, frecuencia y costo estimado en quetzales. |
| `minimumExpectedExpenses` | Gasto mínimo estimado por ciclo, en quetzales. Considera actividades e insumos como mano de obra, fertilizantes, transporte y control de plagas, según lo visible o lo indicado. |
| `expectedProduction` | Producción mínima y máxima estimada por ciclo, expresada en `mainSalesUnit` y en la presentación `productPresentation`. Si la presentación requiere transformación, estima el producto procesado y no confunde su cantidad con la cosecha sin procesar. |
| `localMarketHealth` | Valoración del mercado local según demanda, estabilidad de precios, competencia, estacionalidad y facilidad de venta. Incluye un `score` de 0 a 100, un `status` y una justificación. |
| `riskPercentage` | Riesgo global estimado de 0 a 100. Un porcentaje alto significa mayor riesgo productivo o de inversión. |
| `riskFactors` | Lista breve de factores que contribuyen al riesgo, como clima, plagas, enfermedades, cambios de precio o acceso al mercado. |
| `plantHealthPercentage` | Estimación de la salud de las plantas visibles, de 0 a 100, considerando vigor, color y señales visibles de plagas, enfermedades o deficiencias. |
| `landCleanlinessPercentage` | Estimación de la limpieza del terreno, de 0 a 100, considerando maleza, basura, manejo de rastrojos y orden del cultivo. |

## Ejemplo de respuesta del flujo de cultivos

Los valores siguientes son ilustrativos; no representan datos observados de un productor real.

```json
{
  "status": true,
  "message": "análisis completado exitosamente",
  "businessFlow": "crop",
  "details": {
    "mainSalesUnit": {
      "name": "quintal",
      "description": "100 libras"
    },
    "matchesExpectedProductType": true,
    "cropType": "Maíz",
    "productPresentation": {
      "name": "Grano seco",
      "description": "Presentación común estimada para venta minorista rural al no especificarse otra."
    },
    "recentProductionPrices": {
      "minimum": 150,
      "maximum": 260,
      "average": 200
    },
    "harvestCycle": {
      "minimumDays": 110,
      "maximumDays": 150,
      "description": "Estimación del tiempo entre ciclos de cosecha."
    },
    "careDetails": [
      {
        "activity": "Deshierbe",
        "description": "Control de maleza durante el ciclo.",
        "frequency": "2 veces por ciclo",
        "estimatedCost": 400
      }
    ],
    "minimumExpectedExpenses": 2500,
    "expectedProduction": {
      "minimum": 20,
      "maximum": 35
    },
    "localMarketHealth": {
      "score": 70,
      "status": "favorable",
      "description": "Ejemplo de descripción de la demanda y las condiciones del mercado."
    },
    "riskPercentage": 35,
    "riskFactors": [
      "Variación de lluvias"
    ],
    "plantHealthPercentage": 80,
    "landCleanlinessPercentage": 65
  }
}
```

Los precios y gastos del ejemplo están en quetzales. Cada precio de `recentProductionPrices` es por un quintal de grano seco porque esa es la presentación indicada y la unidad definida en `mainSalesUnit`; representa venta minorista rural al consumidor final, no precio pagado al productor. Los valores son ilustrativos y no cotizaciones reales.

## Interpretación y limitaciones

- Son **estimaciones generadas por IA** a partir de las imágenes y el contexto enviado; no son cotizaciones, diagnósticos agronómicos ni datos de mercado consultados en tiempo real.
- La API no consulta una fuente externa de precios ni busca automáticamente los precios del año anterior. El modelo puede usar referencias históricas que tenga disponibles como orientación, pero no las verifica; para basar el cálculo en precios reales del año anterior, esos datos deben proporcionarse en el contexto o integrarse desde una fuente de precios confiable.
- La producción y los gastos dependen mucho del tamaño del terreno y de la cantidad de plantas. Si esos datos no se ven en las imágenes, proporcionar una estimación de área o cantidad en `specialObservations` puede mejorar el resultado.
- Si se requiere una forma concreta de venta, indícala en `productType` o `specialObservations` (por ejemplo, “café para vender maduro” o “café para vender en pergamino”). La unidad, el precio y la producción estimados corresponderán a esa presentación. Cuando la venta implique procesamiento, la cantidad producida será la del producto procesado estimado.
- Si no se indica la presentación, la API elige la que estima más común para la venta minorista rural. Esa elección es una estimación del modelo, no una validación de la preferencia del productor.
- La salud de las plantas y la limpieza del terreno se estiman solo con lo que es visible. Una imagen parcial o poco clara reduce la precisión.
- Los precios minoristas se presentan en quetzales por la unidad principal elegida por el análisis. Para comparar resultados o calcular ingresos, primero hay que confirmar que la unidad y su equivalencia sean adecuadas para el producto y el mercado local rural.
- La clasificación requiere una llamada al modelo y el análisis del flujo seleccionado requiere otra. Por ello, una solicitud exitosa ahora implica dos llamadas al modelo.

## Compatibilidad con el flujo tradicional

Las solicitudes clasificadas como `traditional` continúan usando el análisis comercial existente. Además de sus métricas comerciales, `details` incluye `estimatedInventoryCoverageDays` (días aproximados que duraría el inventario visible) y `estimatedMonthlyInventoryConsumptionPercentage` (porcentaje estimado de ese inventario que se consumiría en un mes típico). Para estimar los días, el modelo considera el giro, el ticket promedio, las ventas mensuales esperadas y la mezcla/cantidades visibles, calibrando el volumen al tamaño de micronegocios o negocios pequeños de aldeas y municipios, no al de comercios urbanos grandes. Considera solo la venta mensual atribuible a productos, no los ingresos por servicios. La API calcula el porcentaje a partir de los días estimados con un mes de 30 días: (30 / días de cobertura) × 100. Si no se observa inventario vendible, ambos valores son 0. Son aproximaciones, no datos de ventas observadas; el porcentaje puede superar 100 si el inventario duraría menos de un mes. La respuesta incorpora `businessFlow: "traditional"` en el nivel superior para identificar el flujo. El cliente debe tolerar esos campos adicionales y escoger cómo procesar `details` según `businessFlow`.
