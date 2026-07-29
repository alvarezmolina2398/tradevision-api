import { buildApp } from './app.js';
import { config } from './config.js';

const start = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
