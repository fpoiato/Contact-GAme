import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  broadcastToApproved,
  broadcastToRoom,
  deleteConnection,
  generateRoomCode,
  getApprovedConnections,
  getConnection,
  getHostConnection,
  getRoomConnections,
  MAX_PLAYERS,
  nicknameTaken,
  putConnection,
  roomCodeExists,
  sendToConnection,
  ttl24h,
} from './lib/ddb';
import { ok, parseBody, WsEnvelope } from './lib/response';

async function isHost(connectionId: string): Promise<boolean> {
  const conn = await getConnection(connectionId);
  return conn?.isHost === true;
}

async function nextJoinOrder(roomCode: string): Promise<number> {
  const approved = await getApprovedConnections(roomCode);
  if (approved.length === 0) return 0;
  return Math.max(...approved.map((c) => c.joinOrder)) + 1;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const body = parseBody<WsEnvelope>(event);

  if (!body?.action) {
    return ok();
  }

  const { action, payload, roomCode: envelopeRoomCode } = body;

  try {
    switch (action) {
      case 'CREATE_ROOM': {
        const { nickname } = payload as { nickname: string };
        if (!nickname?.trim()) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Nickname required' },
          });
          return ok();
        }

        let roomCode = generateRoomCode();
        let attempts = 0;
        while ((await roomCodeExists(roomCode)) && attempts < 10) {
          roomCode = generateRoomCode();
          attempts++;
        }

        await putConnection({
          connectionId,
          roomCode,
          nickname: nickname.trim(),
          isHost: true,
          joinOrder: 0,
          status: 'approved',
          ttl: ttl24h(),
        });

        await sendToConnection(connectionId, {
          action: 'ROOM_CREATED',
          payload: { roomCode, connectionId, nickname: nickname.trim(), isHost: true },
          roomCode,
        });
        break;
      }

      case 'JOIN_ROOM': {
        const { nickname, roomCode } = payload as { nickname: string; roomCode: string };
        const code = (roomCode || envelopeRoomCode || '').toUpperCase().trim();

        if (!nickname?.trim() || code.length !== 5) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Invalid nickname or room code' },
          });
          return ok();
        }

        const host = await getHostConnection(code);
        if (!host) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Room not found' },
          });
          return ok();
        }

        const approved = await getApprovedConnections(code);
        const pending = (await getRoomConnections(code)).filter((c) => c.status === 'pending');
        if (approved.length + pending.length >= MAX_PLAYERS) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Room is full' },
          });
          return ok();
        }

        if (await nicknameTaken(code, nickname.trim())) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Nickname already taken' },
          });
          return ok();
        }

        await putConnection({
          connectionId,
          roomCode: code,
          nickname: nickname.trim(),
          isHost: false,
          joinOrder: -1,
          status: 'pending',
          ttl: ttl24h(),
        });

        await sendToConnection(connectionId, {
          action: 'JOIN_PENDING',
          payload: { roomCode: code, connectionId, nickname: nickname.trim() },
          roomCode: code,
        });

        await sendToConnection(host.connectionId, {
          action: 'JOIN_PENDING',
          payload: {
            roomCode: code,
            connectionId,
            nickname: nickname.trim(),
            pending: true,
          },
          roomCode: code,
        });
        break;
      }

      case 'APPROVE_PLAYER': {
        if (!(await isHost(connectionId))) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Only host can approve' },
          });
          return ok();
        }

        const hostConn = await getConnection(connectionId);
        const { targetConnectionId } = payload as { targetConnectionId: string };
        const target = await getConnection(targetConnectionId);

        if (!hostConn || !target || target.roomCode !== hostConn.roomCode) {
          return ok();
        }

        const order = await nextJoinOrder(hostConn.roomCode);
        await putConnection({
          ...target,
          status: 'approved',
          joinOrder: order,
          ttl: ttl24h(),
        });

        const approvedPayload = {
          connectionId: target.connectionId,
          nickname: target.nickname,
          joinOrder: order,
          isHost: false,
          status: 'approved' as const,
        };

        await broadcastToApproved(hostConn.roomCode, {
          action: 'PLAYER_APPROVED',
          payload: approvedPayload,
          roomCode: hostConn.roomCode,
        });
        break;
      }

      case 'REJECT_PLAYER': {
        if (!(await isHost(connectionId))) {
          return ok();
        }

        const hostConn = await getConnection(connectionId);
        const { targetConnectionId } = payload as { targetConnectionId: string };
        const target = await getConnection(targetConnectionId);

        if (!hostConn || !target || target.roomCode !== hostConn.roomCode) {
          return ok();
        }

        await deleteConnection(targetConnectionId);
        await sendToConnection(targetConnectionId, {
          action: 'JOIN_REJECTED',
          payload: { message: 'Host rejected your join request' },
        });
        await broadcastToRoom(
          hostConn.roomCode,
          {
            action: 'PLAYER_REJECTED',
            payload: { connectionId: targetConnectionId },
            roomCode: hostConn.roomCode,
          },
          targetConnectionId
        );
        break;
      }

      case 'RELAY': {
        if (!(await isHost(connectionId))) {
          await sendToConnection(connectionId, {
            action: 'ERROR',
            payload: { message: 'Only host can relay game state' },
          });
          return ok();
        }

        const hostConn = await getConnection(connectionId);
        if (!hostConn) return ok();

        await broadcastToApproved(
          hostConn.roomCode,
          {
            action: 'RELAY',
            payload,
            roomCode: hostConn.roomCode,
          },
          connectionId
        );
        break;
      }

      case 'REQUEST_HOST_STATE': {
        const requester = await getConnection(connectionId);
        if (!requester || !requester.isHost) return ok();

        await broadcastToApproved(
          requester.roomCode,
          {
            action: 'REQUEST_HOST_STATE',
            payload: { requesterId: connectionId },
            roomCode: requester.roomCode,
          },
          connectionId
        );
        break;
      }

      case 'HOST_STATE_RESPONSE': {
        const responder = await getConnection(connectionId);
        const { targetHostId, state } = payload as {
          targetHostId: string;
          state: unknown;
        };

        if (!responder || responder.connectionId === targetHostId) return ok();

        await sendToConnection(targetHostId, {
          action: 'HOST_STATE_RESPONSE',
          payload: { state, fromId: connectionId },
          roomCode: responder.roomCode,
        });
        break;
      }

      case 'CAST_VOTE': {
        const voter = await getConnection(connectionId);
        if (!voter) return ok();

        const host = await getHostConnection(voter.roomCode);
        if (!host) return ok();

        await sendToConnection(host.connectionId, {
          action: 'VOTE_FORWARD',
          payload: {
            voterId: connectionId,
            voterNickname: voter.nickname,
            matched: (payload as { matched: boolean }).matched,
          },
          roomCode: voter.roomCode,
        });
        break;
      }

      case 'FORWARD_TO_HOST': {
        const sender = await getConnection(connectionId);
        if (!sender || sender.status !== 'approved') return ok();

        const host = await getHostConnection(sender.roomCode);
        if (!host || host.connectionId === connectionId) return ok();

        await sendToConnection(host.connectionId, {
          action: 'PLAYER_ACTION',
          payload: {
            senderId: connectionId,
            senderNickname: sender.nickname,
            ...(payload as Record<string, unknown>),
          },
          roomCode: sender.roomCode,
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Message handler error', err);
    await sendToConnection(connectionId, {
      action: 'ERROR',
      payload: { message: 'Internal server error' },
    });
  }

  return ok();
};
