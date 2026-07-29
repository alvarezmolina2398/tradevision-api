import OpenAI from 'openai';

import { config } from '../config.js';

let client;

/**
 * Devuelve una instancia única (singleton) del cliente de OpenAI.
 * Se inicializa de forma perezosa para no fallar en el arranque si aún
 * no se ha configurado la API key.
 */
export const getOpenAIClient = () => {
  if (!config.openai.apiKey) {
    throw new Error(
      'Falta la variable de entorno OPENAI_API_KEY. Configúrala en tu archivo .env.'
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }

  return client;
};
