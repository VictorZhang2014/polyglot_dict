import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AI_AWS_REGION || "eu-central-1";
const accessKeyId = process.env.AI_AWS_ACCESS_KEY_ID?.trim() ?? "";
const secretAccessKey = process.env.AI_AWS_SECRET_ACCESS_KEY?.trim() ?? "";
const sessionToken = process.env.AI_AWS_SESSION_TOKEN?.trim() ?? "";
const hasStaticCredentials = Boolean(accessKeyId && secretAccessKey);

if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
  console.warn(
    "[dynamodb] Incomplete static AWS credentials detected. Falling back to the default AWS credential provider chain."
  );
}

// Let the AWS SDK use the runtime credential chain unless both static credential fields are present.
const client = new DynamoDBClient({
  region,
  ...(hasStaticCredentials
    ? {
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {})
        }
      }
    : {})
});

// Configure document client
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, 
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: true, 
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, 
  },
});

export async function getCachedTranslation(cacheKey: string) {
  const tableName = process.env.AI_DYNAMODB_TABLE_NAME;
  if (!tableName) return null;

  try {
    const getResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: cacheKey }
      })
    );
    return getResult.Item?.data || null;
  } catch (err) {
    console.error(`[translate] DynamoDB GetCommand error:`, err);
    return null;
  }
}

export async function cacheTranslation(
  cacheKey: string,
  source: string,
  sourceLanguage: string,
  targetLanguages: string[],
  data: any,
  mode: "word" | "text" = "word"
) {
  const tableName = process.env.AI_DYNAMODB_TABLE_NAME;
  if (!tableName) return;

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          id: cacheKey,
          ...(mode === "text" ? { sourceText: source } : { sourceWord: source }),
          sourceLanguage,
          targetLanguages,
          data,
          createdAt: Date.now(),
          mode
        }
      })
    );
  } catch (err) {
    console.error(`[translate] DynamoDB PutCommand error:`, err);
  }
}

export { docClient, client };
