#!/usr/bin/env bash

PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

docker build . -t "sammarks/cloudformation-webm-mp4:$PACKAGE_VERSION"
docker tag "sammarks/cloudformation-webm-mp4:$PACKAGE_VERSION" "sammarks/cloudformation-webm-mp4:latest"

docker push "sammarks/cloudformation-webm-mp4:$PACKAGE_VERSION"
docker push "sammarks/cloudformation-webm-mp4:latest"
