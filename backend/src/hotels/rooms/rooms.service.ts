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
  //create a room for a specific hotel
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
  //update a room for a specific hotel
  // update a room for a specific hotel
  async updateRoom(hotelId: string, roomId: string, dto: UpdateRoomDto) {
    if (!isValidObjectId(hotelId) || !isValidObjectId(roomId))
      throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    let room: RoomDocument | null;
    try {
      room = await this.roomModel.findOneAndUpdate(
        { _id: roomId, hotelId, isActive: true },
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
  //delete a room for a specific hotel
  async deleteRoom(hotelId: string, roomId: string) {
    if (!isValidObjectId(hotelId) || !isValidObjectId(roomId))
      throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const room = await this.roomModel.findOne({
      _id: roomId,
      hotelId,
      isActive: true,
    });
    if (!room) throw new NotFoundException('Room not found');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to UTC midnight
    const upcoming = await this.availabilityModel.exists({
      roomId: room._id,
      bookingId: { $ne: null },
      date: { $gte: today },
    });

    if (upcoming) {
      throw new ConflictException('Cannot delete room with upcoming bookings');
    }

    room.isActive = false;
    await room.save();
    return { message: 'Room deleted successfully' };
  }
}
