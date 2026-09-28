import type { Room } from "colyseus.js";
import { RoomClient } from "../shared/RoomClient.mjs";

const serverUrl = import.meta.env.VITE_ROOM_SERVER_URL || "http://127.0.0.1:2567";
const client = new RoomClient(serverUrl);

type RoomInvite = { code: string; roomId: string };
type RoomLookup = { roomId: string };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, init);
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `Room service returned ${response.status}.`);
  return data;
}

export async function createPrivateRoom(name: string): Promise<{ room: Room; code: string }> {
  const invite = await requestJson<RoomInvite>("/api/rooms", { method: "POST" });
  const room = await client.joinById(invite.roomId, { name });
  return { room, code: invite.code };
}

export async function joinPrivateRoom(code: string, name: string): Promise<Room> {
  const invite = await requestJson<RoomLookup>(`/api/rooms/${encodeURIComponent(code)}`);
  return client.joinById(invite.roomId, { name });
}
