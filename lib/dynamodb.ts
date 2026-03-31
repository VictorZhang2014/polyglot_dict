import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";

// Create a persistent client connection
const client = new DynamoDBClient({
  region: region,
  // If credentials are provided in env, SDK uses them automatically.
  // We can explicitly pass them if needed, but default credential provider handles
  // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.
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
  const tableName = process.env.DYNAMODB_TABLE_NAME;
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
  sourceWord: string,
  sourceLanguage: string,
  targetLanguages: string[],
  data: any
) {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) return;

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          id: cacheKey,
          sourceWord,
          sourceLanguage,
          targetLanguages,
          data,
          createdAt: Date.now()
        }
      })
    );
  } catch (err) {
    console.error(`[translate] DynamoDB PutCommand error:`, err);
  }
}

export { docClient, client };
