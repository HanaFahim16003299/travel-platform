import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Hotel, HotelDocument } from '../schemas/hotel.schema.js';
import { Room, RoomDocument } from '../schemas/room.schema.js';
import {
  RoomAvailability,
  RoomAvailabilityDocument,
} from '../schemas/room-availability.schema.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { UpdateRoomDto } from '../dto/update-room.dto.js';

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailabilityDocument>,
  ) {}

  // create a room for a specific hotel
  async createRoom(hotelId: string, dto: CreateRoomDto) {
    if (!isValidObjectId(hotelId)) throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    try {
      return await this.roomModel.create({ ...dto, hotelId });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Room name already exists in this hotel');
      }
      throw err;
    }
  }

  // update a room for a specific hotel (also deactivates / reactivates it)
  async updateRoom(hotelId: string, roomId: string, dto: UpdateRoomDto) {
    if (!isValidObjectId(hotelId) || !isValidObjectId(roomId))
      throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    // HTL-06: deactivation is refused if the room has upcoming reservations
    if (dto.isActive === false) {
      const activeRoom = await this.roomModel.exists({
        _id: roomId,
        hotelId,
        isActive: true,
      });
      if (activeRoom) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight
        const upcoming = await this.availabilityModel.exists({
          roomId,
          bookingId: { $ne: null },
          date: { $gte: today },
        });
        if (upcoming) {
          throw new ConflictException(
            'Cannot deactivate room with upcoming bookings',
          );
        }
      }
    }

    let room: RoomDocument | null;
    try {
      // no isActive filter: an inactive room must stay editable and reactivatable
      room = await this.roomModel.findOneAndUpdate(
        { _id: roomId, hotelId },
        { $set: dto },
        { new: true, runValidators: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Room name already exists in this hotel');
      }
      throw err;
    }

    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  // delete a room for a specific hotel (only if it was never reserved)
  async deleteRoom(hotelId: string, roomId: string) {
    if (!isValidObjectId(hotelId) || !isValidObjectId(roomId))
      throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    // no isActive filter: a deactivated room can still be deleted
    const room = await this.roomModel.findOne({ _id: roomId, hotelId });
    if (!room) throw new NotFoundException('Room not found');

    // HTL-06: any booking, past or future, blocks deletion
    const booked = await this.availabilityModel.exists({
      roomId: room._id,
      bookingId: { $ne: null },
    });
    if (booked) {
      throw new ConflictException(
        'Room has bookings; deactivate it instead of deleting',
      );
    }

    await this.availabilityModel.deleteMany({ roomId: room._id });
    await room.deleteOne();
    return { message: 'Room deleted successfully' };
  }
}
