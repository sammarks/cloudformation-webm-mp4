const AWS = require('aws-sdk')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

/**
 * Required environment variables:
 *
 * - OUTPUT_BUCKET - The name of the output bucket.
 * - SNS_TOPIC - The ARN for the SNS topic to send notifications to.
 * - INPUT_SOURCE_KEY - The key of the object we are transcoding.
 * - INPUT_BUCKET - The name of the bucket the object is coming from.
 */

const FFMPEG_PATH = '/usr/local/bin/ffmpeg'
const s3 = new AWS.S3()
const sns = new AWS.SNS()
const outputBucket = process.env.OUTPUT_BUCKET
const snsTopic = process.env.SNS_TOPIC

const STATUSES = {
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE'
}

const reportStatusUpdate = async (bucket, key, status, detail) => {
  const payload = { bucket, key, status, detail }
  console.info('reporting status update', payload)
  try {
    await sns.publish({
      Message: JSON.stringify(payload),
      TopicArn: snsTopic
    }).promise()
  } catch (err) {
    console.error('error reporting status update')
    console.error(err)
    throw err
  }
  console.info('reported')
}

const downloadFile = (bucket, srcKey, resultPath) => {
  return new Promise((resolve, reject) => {
    console.info('downloading from bucket %s and key %s', bucket, srcKey)
    const file = fs.createWriteStream(resultPath)
    s3.getObject({
      Bucket: bucket,
      Key: srcKey
    }).createReadStream().on('error', err => {
      console.error('error writing to result file')
      console.error(err)
      reject(new Error('error writing to result file'))
    }).pipe(file).on('close', () => {
      console.info('file written successfully')
      resolve()
    })
  })
}

const convertVideo = (bucket, srcKey) => {
  return new Promise((resolve, reject) => {
    const targetKey = srcKey.replace('.webm', '.mp4')
    const sourceFilename = path.join(os.tmpdir(), path.basename(srcKey))
    const targetFilename = path.join(os.tmpdir(), path.basename(targetKey))
    const cleanFiles = () => {
      try {
        fs.unlinkSync(sourceFilename)
        fs.unlinkSync(targetFilename)
      } catch (err) {
        console.error('error cleaning files')
        console.error(err)
      }
    }
    console.info('downloading webm (h264) source to', sourceFilename)
    downloadFile(bucket, srcKey, sourceFilename).then(() => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-i',
        sourceFilename,
        '-c:v',
        'copy',
        '-f',
        'mp4',
        targetFilename
      ], {
        stdio: 'inherit'
      })
      ffmpeg.on('close', code => {
        if (code !== 0) {
          console.error('error processing ffmpeg. see logs for more details')
          cleanFiles()
          reject(new Error('error processing ffmpeg. see logs for more details'))
        } else {
          const fileStream = fs.createReadStream(targetFilename)
          s3.upload({
            Bucket: outputBucket,
            Key: targetKey,
            Body: fileStream
          }, err => {
            fileStream.close()
            cleanFiles()
            if (err) {
              reject(err)
            } else {
              resolve(targetKey)
            }
          })
        }
      })
    }).catch(err => reject(err))
  })
}

const processItem = async () => {
  const srcKey = process.env.INPUT_SOURCE_KEY
  const bucket = process.env.INPUT_BUCKET
  await reportStatusUpdate(bucket, srcKey, STATUSES.PROCESSING)

  try {
    const resultKey = await convertVideo(bucket, srcKey)
    await reportStatusUpdate(bucket, srcKey, STATUSES.COMPLETE, resultKey)
  } catch (err) {
    console.error('error found during processing')
    console.error(err)
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, err.stack)
  }
}

processItem().then(() => {
  process.exit(0)
}).catch(() => {
  process.exit(1)
})
