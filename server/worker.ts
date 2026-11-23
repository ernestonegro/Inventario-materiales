// Entrada del Worker: solo recibe /api/* (run_worker_first); el resto lo sirve
// directamente Static Assets desde ./dist.
import app from './app';

export default app;
