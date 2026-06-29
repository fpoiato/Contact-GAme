import { APIGatewayProxyResult, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

export function ok(): APIGatewayProxyResult {
  return { statusCode: 200, body: 'OK' };
}

export function parseBody<T>(event: APIGatewayProxyWebsocketEventV2): T | null {
  if (!event.body) {
    return null;
  }
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}

export function wsResponse(statusCode: number, body: string): APIGatewayProxyResult {
  return { statusCode, body };
}

export interface WsEnvelope {
  action: string;
  payload?: unknown;
  roomCode?: string;
}
