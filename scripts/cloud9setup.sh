#!/bin/bash

pip install awscli --upgrade --user
npm uninstall -g aws-sam-local
rm `which sam`
pip install aws-sam-cli --user
ln -sfn $(which sam) ~/.c9/bin/sam
