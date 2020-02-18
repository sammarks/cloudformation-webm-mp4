![][header-image]

[![CircleCI](https://img.shields.io/circleci/build/github/sammarks/cloudformation-webm-mp4/master)](https://circleci.com/gh/sammarks/cloudformation-webm-mp4)
[![Coveralls](https://img.shields.io/coveralls/sammarks/cloudformation-webm-mp4.svg)](https://coveralls.io/github/sammarks/cloudformation-webm-mp4)
[![Dev Dependencies](https://david-dm.org/sammarks/cloudformation-webm-mp4/dev-status.svg)](https://david-dm.org/sammarks/cloudformation-webm-mp4?type=dev)
[![Donate](https://img.shields.io/badge/donate-paypal-blue.svg)](https://paypal.me/sammarks15)

`cloudformation-webm-mp4` is an AWS SAM + CloudFormation template designed to ingest WEBM videos
encoded with the H264 Codec (possible using [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) APIs),
and convert them to MP4 videos with the same H264 video codec. It sends a notification through
SNS to keep track of progress and completion.

This package utilizes [serverlesspub's ffmpeg-aws-lambda-layer package](https://github.com/serverlesspub/ffmpeg-aws-lambda-layer) for easily packaging ffmpeg with the Lambda function.

## Get Started

It's simple! Click this fancy button:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=webm-mp4&templateURL=https://sammarks-cf-templates.s3.amazonaws.com/webm-mp4/template.yaml)

Then give the stack a name, and configure it:

### Parameters

| Parameter | Required | Default Value | Description |
| --- | --- | --- | --- |
| InputBucketName | **Yes** | | The name of the bucket to use for video inputs. **This bucket MUST NOT already exist.** |
| OutputBucketName | **Yes** | | The name of the bucket to use for output videos. **This bucket MUST already exist.** |
| DebugLevel | No | `<empty string>` | The `DEBUG` environment variable for the Lambda. Set to `cloudformation-webm-mp4` to enable debug messages. |

### Outputs

| Output | Description |
| --- | --- |
| InputBucket | The name of the bucket where videos should be uploaded. |
| InputBucketArn | The ARN for the bucket where videos should be uploaded. |
| Topic | The ARN for the SNS Topic to subscribe to for pipeline notifications. |
| S3Topic | The ARN for the SNS Topic to subscribe to for object creation notifications from the input bucket. |

### Usage in Another Stack or Serverless

Add something like this underneath resources:

```yaml
videoThumbnailStack:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: https://sammarks-cf-templates.s3.amazonaws.com/webm-mp4/VERSION/template.yaml
    Parameters:
      InputBucketName: test-input-bucket
      OutputBucketName: test-output-bucket
      DebugLevel: ''
```

**Note:** This stack will require the `CAPABILITY_AUTO_EXPAND` capability when deploying
the parent stack with CloudFormation. If you are using the Serverless framework, you can
"trick" it into adding the required capabilities by adding this to your `serverless.yaml`:

```yaml
resources:
  Transform: 'AWS::Serverless-2016-10-31' # Trigger Serverless to add CAPABILITY_AUTO_EXPAND
  Resources:
    otherResource: # ... all of your original resources
```

### Regions

**A quick note on regions:** If you are deploying this stack in a region other than `us-east-1`,
you need to reference the proper region S3 bucket as we're deploying Lambda functions. Just
add the region suffix to the template URL, so this:

```
https://sammarks-cf-templates.s3.amazonaws.com/webm-mp4/VERSION/template.yaml
```

becomes this:

```
https://sammarks-cf-templates-us-east-2.s3.amazonaws.com/webm-mp4/VERSION/template.yaml
```

### Subscribing to object creation events

S3 does not allow two separate Lambda functions to be subscribed to the same
event types on a single bucket. Because of this, the template creates an SNS
topic to serve as the messenger for the S3 notifications, and the internal
Lambda function subscribes to that SNS topic.

Because of this, if you want to subscribe to the object creation events in your
own Lambda functions, simply create a Lambda function that references the
`S3Topic` output of this stack.

### What's deployed?

- One S3 bucket, for video input.
- A SNS topic for notifications.
- A SNS topic for object created notifications for the input bucket.
- A Lambda function to process the videos.

### How does it work?

The Lambda goes through the following process:

- Verify the video ends in `.webm` - it will throw an error if it does not.
- Get a signed URL for the video using S3.
- Pipe the `https.get()` result into the `ffmpeg` process to convert the video.
- Start an upload using `s3.upload()` to the destination bucket.
- Pipe the stream from `ffmpeg` into `s3.upload`
- Send a notification through SNS when the process is complete or errors.

### Accessing Previous Versions & Upgrading

Each time a release is made in this repository, the corresponding template is available at:

```
https://sammarks-cf-templates.s3.amazonaws.com/webm-mp4/VERSION/template.yaml
```

**On upgrading:** I actually _recommend_ you lock the template you use to a specific version. Then, if you want to update to a new version, all you have to change in your CloudFormation template is the version and AWS will automatically delete the old stack and re-create the new one for you.

## Features

- Automatically convert `webm` videos encoded in the H264 codec to `mp4` videos with the same codec.
- Send notifications about updates and error messages to a SNS topic.
- Deploy with other CloudFormation-compatible frameworks (like the Serverless framework).
- All functionality is self-contained within one CloudFormation template. Delete the template, and all of our created resources are removed.

## Why use this?

As I mentioned briefly above, the inspiration for this template was to easily convert videos
generated using the [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) APIs
(which support H264 in WEBM format), to MP4 videos for broader consumption on mobile devices.

Running `ffmpeg` inside Lambda to achieve this becomes immensely cheaper than using something
like AWS' ElementalMedia services.

[header-image]: https://raw.githubusercontent.com/sammarks/art/master/cloudformation-webm-mp4/header.jpg
