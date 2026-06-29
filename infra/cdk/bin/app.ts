#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ContactWsStack } from '../lib/contact-ws-stack';

const app = new cdk.App();

new ContactWsStack(app, 'ContactWsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
