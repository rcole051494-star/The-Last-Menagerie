import {
  Client,
  type Room,
  type SchemaConstructor,
  type SeatReservation,
} from "colyseus.js";

export declare class RoomClient extends Client {
  override consumeSeatReservation<T = unknown>(
    response: SeatReservation,
    rootSchema?: SchemaConstructor<T>,
    reuseRoomInstance?: Room,
  ): Promise<Room<T>>;
}
