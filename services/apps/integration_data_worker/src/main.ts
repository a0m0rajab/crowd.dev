import { getServiceLogger } from '@crowd/logging'
import { DB_CONFIG, REDIS_CONFIG, SQS_CONFIG } from './conf'
import { getRedisClient } from '@crowd/redis'
import { getDbConnection } from '@crowd/database'
import { DataSinkWorkerEmitter, IntegrationStreamWorkerEmitter, getSqsClient } from '@crowd/sqs'
import { WorkerQueueReceiver } from './queue'

const log = getServiceLogger()

const MAX_CONCURRENT_PROCESSING = 2

setImmediate(async () => {
  log.info('Starting integration data worker...')

  const sqsClient = getSqsClient(SQS_CONFIG())

  const dbConnection = await getDbConnection(DB_CONFIG(), MAX_CONCURRENT_PROCESSING)
  const redisClient = await getRedisClient(REDIS_CONFIG(), true)

  const streamWorkerEmitter = new IntegrationStreamWorkerEmitter(sqsClient, log)
  const dataSinkWorkerEmitter = new DataSinkWorkerEmitter(sqsClient, log)

  const queue = new WorkerQueueReceiver(
    sqsClient,
    redisClient,
    dbConnection,
    streamWorkerEmitter,
    dataSinkWorkerEmitter,
    log,
    MAX_CONCURRENT_PROCESSING,
  )

  try {
    await streamWorkerEmitter.init()
    await dataSinkWorkerEmitter.init()
    await queue.start()
  } catch (err) {
    log.error({ err }, 'Failed to start queues!')
    process.exit(1)
  }
})
