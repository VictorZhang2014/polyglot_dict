# Translate Stream Lambda

This folder contains the standalone AWS Lambda entrypoint for the word-translation SSE endpoint.

## Build

Install the bundler once:

```bash
npm install --save-dev esbuild
```

Then build the deployable artifact:

```bash
npm run build:lambda:translate-stream
```

The build outputs:

- `dist-lambda/translate-stream/index.mjs`
- `dist-lambda/translate-stream/deploy-manifest.json`
- `dist-lambda/translate-stream.zip`

## Deploy

Create a Node.js Lambda function and upload `dist-lambda/translate-stream.zip`.

Recommended settings:

- Runtime: `nodejs20.x`
- Handler: `index.handler`
- Function URL: enabled
- Function URL invoke mode: `RESPONSE_STREAM`

Useful environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE_URL`
- `OPENAI_AUDIO_API_URL`
- `CLAUDE_API_KEY`
- `CLAUDE_MODEL` 
- `AI_DYNAMODB_TABLE_NAME`
- `AI_AWS_REGION`
- `CORS_ALLOW_ORIGIN`
