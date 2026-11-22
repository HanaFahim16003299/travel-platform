import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Hotel, HotelDocument } from '../schemas/hotel.schema.js';
import { Room, RoomDocument } from '../schemas/room.schema.js';
import {
  RoomAvailability,
  RoomAvailabilityDocument,
} from '../schemas/room-availability.schema.js';
import { CreateAvailabilityDto } from '../dto/create-availability.dto.js';
import {
  AvailabilityAction,
  UpdateAvailabilityDto,
} from '../dto/update-availability.dto.js';
import { assertNotInPast, getNightsBetween, toUtcMidnight } from '../utils/date-range.util.js';
import{ QueryAvailabilityDto } from '../dto/query-availability.dto.js';
import { buildMeta } from '../../common/utils/pagination.js';

export enum NightStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
}
 export interface NightView {
  date: Date;
  status: NightStatus;
  bookingId?: Types.ObjectId;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailabilityDocument>,
  ) {}

  // HTL-04: open a date range of nights for a room (ranges must not overlap)
  async create(hotelId: string, roomId: string, dto: CreateAvailabilityDto) {
    await this.assertActiveRoom(hotelId, roomId);

    const nights = getNightsBetween(dto.startDate, dto.endDate);
    assertNotInPast(nights[0]);

    const room = new Types.ObjectId(roomId);
    const hotel = new Types.ObjectId(hotelId);

    const overlap = await this.availabilityModel.exists({
      roomId: room,
      date: { $in: nights },
    });
    if (overlap) {
      throw new ConflictException(
        'Some nights in this range are already open for this room',
      );
    }

    try {
      // insertMany applies schema defaults (isBlocked: false, bookingId: null)
      await this.availabilityModel.insertMany(
        nights.map((date) => ({ roomId: room, hotelId: hotel, date })),
      );
    } catch (err) {
      // a concurrent request opened one of these nights first
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Some nights in this range are already open for this room',
        );
      }
      throw err;
    }

    return { created: nights.length };
  }

  // HTL-05/06: block, unblock or remove a date range of nights
  async update(hotelId: string, roomId: string, dto: UpdateAvailabilityDto) {
    await this.assertActiveRoom(hotelId, roomId);

    const nights = getNightsBetween(dto.startDate, dto.endDate);
    assertNotInPast(nights[0]);

    const range = {
      roomId: new Types.ObjectId(roomId),
      date: { $in: nights },
    };

    // every night in the range must have been opened first
    const open = await this.availabilityModel.countDocuments(range);
    if (open !== nights.length) {
      throw new BadRequestException(
        `${nights.length - open} night(s) in this range are not open for this room`,
      );
    }

    // any reservation (Confirmed or Pending Payment) rejects the whole request
    const booked = await this.availabilityModel.exists({
      ...range,
      bookingId: { $ne: null },
    });
    if (booked) {
      throw new ConflictException(
        'Some nights in this range are reserved; nothing was changed',
      );
    }

    // bookingId: null in the write filter protects a night that gets
    // reserved between the check above and the write (it is left untouched)
    const writable = { ...range, bookingId: null };

    if (dto.action === AvailabilityAction.REMOVE) {
      const result = await this.availabilityModel.deleteMany(writable);
      return { requested: nights.length, removed: result.deletedCount };
    }

    const result = await this.availabilityModel.updateMany(writable, {
      $set: { isBlocked: dto.action === AvailabilityAction.BLOCK },
    });
    return { requested: nights.length, modified: result.modifiedCount };
  }
// HTL-08: status of every opened night, per room, for a date range
  async getHotelAvailability(hotelId: string, query: QueryAvailabilityDto) {
    if (!isValidObjectId(hotelId)) throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    // validates the range; past ranges are allowed here (moderators can look back)
    const nights = getNightsBetween(query.startDate, query.endDate);
    const first = nights[0];
    const end = toUtcMidnight(query.endDate); // exclusive

    const { page, limit } = query;
    const roomFilter = { hotelId: new Types.ObjectId(hotelId) };

    // paginate by rooms; deactivated rooms are included on purpose
    const [rooms, total] = await Promise.all([
      this.roomModel
        .find(roomFilter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.roomModel.countDocuments(roomFilter),
    ]);

    // one query for all rooms on the page (max limit rooms x 366 nights)
    const records = await this.availabilityModel
      .find({
        roomId: { $in: rooms.map((room) => room._id) },
        date: { $gte: first, $lt: end },
      })
      .sort({ date: 1 })
      .lean();

    const nightsByRoom = new Map<string, NightView[]>();
    for (const record of records) {
      const key = record.roomId.toString();
      const list = nightsByRoom.get(key) ?? [];
      list.push(this.toNightView(record));
      nightsByRoom.set(key, list);
    }

    return {
      data: rooms.map((room) => ({
        roomId: room._id,
        name: room.name,
        isActive: room.isActive,
        nights: nightsByRoom.get(room._id.toString()) ?? [],
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  // BOOKED wins over BLOCKED; nights that were never opened are not returned
  private toNightView(record: {
    date: Date;
    isBlocked: boolean;
    bookingId?: Types.ObjectId | null;
  }): NightView {
    if (record.bookingId) {
      // TODO: return the reservation reference once HotelBooking exists
      return {
        date: record.date,
        status: NightStatus.BOOKED,
        bookingId: record.bookingId,
      };
    }
    return {
      date: record.date,
      status: record.isBlocked ? NightStatus.BLOCKED : NightStatus.AVAILABLE,
    };
  }
  // same checks as RoomsService, shared by every availability method
  private async assertActiveRoom(hotelId: string, roomId: string) {
    if (!isValidObjectId(hotelId) || !isValidObjectId(roomId))
      throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.exists({
      _id: hotelId,
      isActive: true,
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const room = await this.roomModel.exists({
      _id: roomId,
      hotelId,
      isActive: true,
    });
    if (!room) throw new NotFoundException('Room not found');
  }
    
}