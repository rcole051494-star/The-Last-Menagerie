import { Client } from "colyseus.js";

export class RoomClient extends Client {
  consumeSeatReservation(response, rootSchema, reuseRoomInstance) {
    if (!response.room) {
      response.room = {
        name: response.name,
        roomId: response.roomId,
        clients: 0,
        maxClients: 4,
      };
    }
    return super.consumeSeatReservation(response, rootSchema, reuseRoomInstance);
  }
}
