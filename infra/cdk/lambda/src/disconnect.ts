import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  broadcastToRoom,
  deleteConnection,
  getConnection,
  promoteNextHost,
  putRejoinSlot,
  ttl24h,
} from './lib/ddb';
import { ok } from './lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;

  const record = await getConnection(connectionId);
  if (!record) {
    return ok();
  }

  const { roomCode, isHost, nickname, joinOrder } = record;
  await putRejoinSlot({
    roomCode,
    nickname,
    isHost,
    joinOrder,
    previousConnectionId: connectionId,
    ttl: ttl24h(),
  });
  await deleteConnection(connectionId);

  if (isHost) {
    const newHost = await promoteNextHost(roomCode, connectionId);
    if (newHost) {
      await broadcastToRoom(roomCode, {
        action: 'HOST_CHANGED',
        payload: {
          newHostId: newHost.connectionId,
          newHostNickname: newHost.nickname,
          previousHostId: connectionId,
        },
        roomCode,
      });
    }
  } else {
    await broadcastToRoom(
      roomCode,
      {
        action: 'PLAYER_LEFT',
        payload: { connectionId, nickname: record.nickname },
        roomCode,
      },
      connectionId
    );
  }

  return ok();
};
