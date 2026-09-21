import { parseWorkerConfig } from './config.js'
import { startWorker } from './lifecycle.js'

async function main() {
  const worker = await startWorker(parseWorkerConfig(process.env))
  console.info('Worker ready: database connected; task execution is not implemented.')
  const shutdown = () => {
    void worker.stop().then(() => {
      console.info('Worker stopped.')
    }).catch(() => {
      console.error('Worker shutdown failed.')
      process.exitCode = 1
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Worker startup failed.')
  process.exitCode = 1
})
