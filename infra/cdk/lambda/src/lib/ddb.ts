import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export interface ConnectionRecord {
  connectionId: string;
  roomCode: string;
  nickname: string;
  isHost: boolean;
  joinOrder: number;
  status: 'pending' | 'approved';
  ttl: number;
}

export interface RejoinSlot {
  connectionId: string;
  roomCode: string;
  nickname: string;
  isHost: boolean;
  joinOrder: number;
  previousConnectionId: string;
  ttl: number;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

export function ttl24h(): number {
  return Math.floor(Date.now() / 1000) + 86400;
}

export async function getConnection(connectionId: string): Promise<ConnectionRecord | undefined> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { connectionId } })
  );
  return result.Item as ConnectionRecord | undefined;
}

export async function putConnection(record: ConnectionRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { connectionId } }));
}

function rejoinKey(roomCode: string, nickname: string): string {
  return `REJOIN#${roomCode}#${nickname.toLowerCase()}`;
}

export async function putRejoinSlot(slot: Omit<RejoinSlot, 'connectionId'>): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        connectionId: rejoinKey(slot.roomCode, slot.nickname),
        ...slot,
      },
    })
  );
}

export async function getRejoinSlot(
  roomCode: string,
  nickname: string
): Promise<RejoinSlot | undefined> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { connectionId: rejoinKey(roomCode, nickname) } })
  );
  return result.Item as RejoinSlot | undefined;
}

export async function deleteRejoinSlot(roomCode: string, nickname: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { connectionId: rejoinKey(roomCode, nickname) } }));
}

export async function getRoomConnections(roomCode: string): Promise<ConnectionRecord[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'RoomCodeIndex',
      KeyConditionExpression: 'roomCode = :roomCode',
      ExpressionAttributeValues: { ':roomCode': roomCode },
    })
  );
  return (result.Items ?? []) as ConnectionRecord[];
}

export async function getApprovedConnections(roomCode: string): Promise<ConnectionRecord[]> {
  return (await getRoomConnections(roomCode)).filter((c) => c.status === 'approved');
}

export async function getHostConnection(roomCode: string): Promise<ConnectionRecord | undefined> {
  const connections = await getApprovedConnections(roomCode);
  return connections.find((c) => c.isHost);
}

export function getApiClient(): ApiGatewayManagementApiClient {
  const endpoint = process.env.WEBSOCKET_ENDPOINT;
  if (!endpoint) {
    throw new Error('WEBSOCKET_ENDPOINT not configured');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
}

export async function sendToConnection(
  connectionId: string,
  message: unknown
): Promise<boolean> {
  const client = getApiClient();
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      })
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410) {
      await deleteConnection(connectionId);
    }
    return false;
  }
}

export async function broadcastToRoom(
  roomCode: string,
  message: unknown,
  excludeConnectionId?: string
): Promise<void> {
  const connections = await getRoomConnections(roomCode);
  await Promise.all(
    connections
      .filter((c) => c.connectionId !== excludeConnectionId)
      .map((c) => sendToConnection(c.connectionId, message))
  );
}

export async function broadcastToApproved(
  roomCode: string,
  message: unknown,
  excludeConnectionId?: string
): Promise<void> {
  const connections = await getApprovedConnections(roomCode);
  await Promise.all(
    connections
      .filter((c) => c.connectionId !== excludeConnectionId)
      .map((c) => sendToConnection(c.connectionId, message))
  );
}

export async function promoteNextHost(
  roomCode: string,
  excludeConnectionId: string
): Promise<ConnectionRecord | undefined> {
  const approved = (await getApprovedConnections(roomCode))
    .filter((c) => c.connectionId !== excludeConnectionId)
    .sort((a, b) => a.joinOrder - b.joinOrder);

  if (approved.length === 0) {
    return undefined;
  }

  const newHost = approved[0];

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { connectionId: newHost.connectionId },
      UpdateExpression: 'SET isHost = :true',
      ExpressionAttributeValues: { ':true': true },
    })
  );

  for (const conn of approved.slice(1)) {
    if (conn.isHost) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { connectionId: conn.connectionId },
          UpdateExpression: 'SET isHost = :false',
          ExpressionAttributeValues: { ':false': false },
        })
      );
    }
  }

  return { ...newHost, isHost: true };
}

export function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

export async function roomCodeExists(roomCode: string): Promise<boolean> {
  const connections = await getRoomConnections(roomCode);
  return connections.some((c) => c.status === 'approved');
}

export async function nicknameTaken(roomCode: string, nickname: string): Promise<boolean> {
  const connections = await getRoomConnections(roomCode);
  return connections.some(
    (c) => c.nickname.toLowerCase() === nickname.toLowerCase()
  );
}

export const MAX_PLAYERS = 12;
