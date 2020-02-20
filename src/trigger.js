const AWS = require('aws-sdk')

const sns = new AWS.SNS()
const ecs = new AWS.ECS()
const snsTopic = process.env.SNS_TOPIC
const ALLOWED_TYPES = ['webm']

const STATUSES = {
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE'
}

const reportStatusUpdate = async (bucket, key, status, detail) => {
  const payload = { bucket, key, status, detail }
  console.info('reporting status update', payload)
  await sns.publish({
    Message: JSON.stringify(payload),
    TopicArn: snsTopic
  }).promise()
  console.info('reported')
}

module.exports.handler = async event => {
  console.info('incoming S3 message', event.Records[0].Sns.Message)
  const message = JSON.parse(event.Records[0].Sns.Message)
  console.info('decoded message', message)
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
    await ecs.runTask({
      launchType: 'FARGATE',
      cluster: process.env.ECS_CLUSTER,
      taskDefinition: process.env.ECS_TASK_DEFINITION,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.SUBNET_NAMES.split(',').map(subnet => subnet.trim()),
          securityGroups: process.env.SECURITY_GROUP_NAMES.split(',').map(group => group.trim()),
          assignPublicIp: 'DISABLED'
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: process.env.ECS_TASK_CONTAINER,
            environment: [
              { name: 'INPUT_SOURCE_KEY', value: srcKey },
              { name: 'INPUT_BUCKET', value: bucket }
            ]
          }
        ]
      },
      count: 1
    }).promise()
  } catch (err) {
    console.error('error triggering the ECS task')
    console.error(err)
    await reportStatusUpdate(bucket, srcKey, STATUSES.ERROR, err.stack)
  }
}
