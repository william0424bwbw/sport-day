import { DurableObject } from 'cloudflare:workers';

// 每場運動會（projectId）一個實例，負責 WebSocket 連線與「有新版本」廣播。
// I4 實作：WebSocket Hibernation、setWebSocketAutoResponse 心跳、廣播。
export class ProjectRoom extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
