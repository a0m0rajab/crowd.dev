import { getDbConnection } from '@crowd/database'
import { getServiceLogger } from '@crowd/logging'
import { NodejsWorkerEmitter, SearchSyncWorkerEmitter, getSqsClient } from '@crowd/sqs'
import { DB_CONFIG, SENTIMENT_CONFIG, SQS_CONFIG, REDIS_CONFIG } from './conf'
import { WorkerQueueReceiver } from './queue'
import { initializeSentimentAnalysis } from '@crowd/sentiment'
import { getRedisClient } from '@crowd/redis'

const log = getServiceLogger()

const MAX_CONCURRENT_PROCESSING = 3

setImmediate(async () => {
  log.info('Starting data sink worker...')

  const sqsClient = getSqsClient(SQS_CONFIG())

  const dbConnection = await getDbConnection(DB_CONFIG(), MAX_CONCURRENT_PROCESSING)

  const redisClient = await getRedisClient(REDIS_CONFIG())

  if (SENTIMENT_CONFIG()) {
    initializeSentimentAnalysis(SENTIMENT_CONFIG())
  }

  const nodejsWorkerEmitter = new NodejsWorkerEmitter(sqsClient, log)
  const searchSyncWorkerEmitter = new SearchSyncWorkerEmitter(sqsClient, log)

  const queue = new WorkerQueueReceiver(
    sqsClient,
    dbConnection,
    nodejsWorkerEmitter,
    searchSyncWorkerEmitter,
    redisClient,
    log,
    MAX_CONCURRENT_PROCESSING,
  )

  try {
    await nodejsWorkerEmitter.init()
    await searchSyncWorkerEmitter.init()
    await queue.start()
  } catch (err) {
    log.error({ err }, 'Failed to start queues!')
    process.exit(1)
  }
})
