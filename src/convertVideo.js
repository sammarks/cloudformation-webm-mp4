const AWS = require('aws-sdk')
const { spawn } = require('child_process')
const debug = require('debug')('cloudformation-webm-mp4')
const https = require('https')

const FFMPEG_PATH = '/opt/bin/ffmpeg'
const s3 = new AWS.S3()
const sns = new AWS.SNS()
const outputBucket = process.env.OUTPUT_BUCKET
const snsTopic = process.env.SNS_TOPIC
const ALLOWED_TYPES = ['webm']

const STATUSES = {
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE'
}

const reportStatusUpdate = async (bucket, key, status, detail) => {
  const payload = { bucket, key, status, detail }
  debug('reporting status update %O', payload)
  await sns.publish({
    Message: JSON.stringify(payload),
    TopicArn: snsTopic
  }).promise()
  debug('reported')
}

const convertVideo = (bucket, srcKey) => {
  return new Promise((resolve, reject) => {
    const targetKey = srcKey.replace('.webm', '.mp4')
    debug('converting webm (h264) from %s to mp4 at %s', srcKey, targetKey)
    const signedUrl = s3.getSignedUrl('getObject', { Bucket: bucket, Key: srcKey, Expires: 60000 })
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-i',
      'pipe:0',
      '-c:v',
      'copy',
      '-f',
      'mp4',
      '-movflags',
      'empty_moov',
      'pipe:1'
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    })
    https.get(signedUrl, response => {
      response.pipe(ffmpeg.stdin)
    })
    s3.upload({
      Bucket: outputBucket,
      Key: targetKey,
      Body: ffmpeg.stdout
    }, err => {
      if (err) {
        reject(err)
      } else {
        resolve(targetKey)
      }
    })
    ffmpeg.on('error', err => {
      debug('error processing video. see logs.')
      debug(err)
      reject(err)
    })
  })
}

module.exports.handler = async event => {
  debug('incoming S3 message', event.Records[0].Sns.Message)
  const message = JSON.parse(event.Records[0].Sns.Message)
  debug('decoded message', message)
  const srcKey = decodeURIComponent(message.Records[0].s3.object.key).replace(/\+/g, ' ')
  const bucket = message.Records[0].s3.bucket.name

  await reportStatusUpdate(bucket, srcKey, STATUSES.PROCESSING)
  let fileType = srcKey.match(/\.\w+$/)

  if (!fileType) {
    const message = `Invalid file type found for key: ${srcKey}`
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, message)
    throw new Error(message)
  }
  fileType = fileType[0].slice(1)

  if (ALLOWED_TYPES.indexOf(fileType) === -1) {
    const message = `Filetype: ${fileType} is not an allowed type`
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, message)
    throw new Error(message)
  }

  try {
    const resultKey = await convertVideo(bucket, srcKey)
    await reportStatusUpdate(bucket, srcKey, STATUSES.COMPLETE, resultKey)
  } catch (err) {
    debug('error found during processing')
    debug(err)
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, err.stack)
  }
}
