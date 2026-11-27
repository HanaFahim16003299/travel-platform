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
// Added by Mohamed Hesham: HTL-08.
import {
  HotelBooking,
  HotelBookingDocument,
} from '../../hotel-bookings/schemas/hotel-booking.schema.js';
import { CreateAvailabilityDto } from '../dto/create-availability.dto.js';
import {
  AvailabilityAction,
  UpdateAvailabilityDto,
} from '../dto/update-availability.dto.js';
import {
  assertNotInPast,
  getNightsBetween,
  toUtcMidnight,
} from '../utils/date-range.util.js';
import { QueryAvailabilityDto } from '../dto/query-availability.dto.js';
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
  // Added by Mohamed Hesham: HTL-08, only present once the booking is confirmed.
  bookingReference?: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailabilityDocument>,
    // Added by Mohamed Hesham: HTL-08.
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBookingDocument>,
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

    // Added by Mohamed Hesham: HTL-08, one query for the references of every booked night.
    const references = await this.findBookingReferences(records);

    const nightsByRoom = new Map<string, NightView[]>();
    for (const record of records) {
      const key = record.roomId.toString();
      const list = nightsByRoom.get(key) ?? [];
      list.push(this.toNightView(record, references));
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

  // HTL-11 / HTL-15: active rooms that are free for every night of the stay
  // Changed by Mohamed Hesham: GEN-05, returns one page of rooms plus the total count.
  async findFreeRooms(
    hotelId: string,
    startDate: Date,
    endDate: Date,
    page: number,
    limit: number,
  ) {
    if (!isValidObjectId(hotelId)) throw new BadRequestException('Invalid id');

    // endDate is the check-out day, so it is not a night of the stay
    const nights = getNightsBetween(startDate, endDate);
    assertNotInPast(nights[0]);

    const roomIds = await this.freeRoomIds(new Types.ObjectId(hotelId), nights);

    // deactivated rooms are excluded from search (HTL-06)
    const filter = { _id: { $in: roomIds }, isActive: true };
    const [rooms, total] = await Promise.all([
      this.roomModel
        .find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.roomModel.countDocuments(filter),
    ]);
    return { rooms, total };
  }

  // HTL-11 / HTL-12: same free-room check as findFreeRooms, for many hotels at
  // once (one aggregation, not one query per hotel), grouped by hotel id
  async findFreeRoomsByHotel(
    hotelIds: Types.ObjectId[],
    startDate: Date,
    endDate: Date,
  ) {
    const nights = getNightsBetween(startDate, endDate);
    assertNotInPast(nights[0]);

    const roomIds = await this.freeRoomIds({ $in: hotelIds }, nights);

    // deactivated rooms are excluded from search (HTL-06); cheapest first per
    // hotel, as summarizeFreeRooms expects
    const rooms = await this.roomModel
      .find({ _id: { $in: roomIds }, isActive: true })
      .sort({ pricePerNight: 1 })
      .lean();

    const byHotel = new Map<string, (typeof rooms)[number][]>();
    for (const room of rooms) {
      const key = room.hotelId.toString();
      const list = byHotel.get(key) ?? [];
      list.push(room);
      byHotel.set(key, list);
    }
    return byHotel;
  }

  // shared by findFreeRooms / findFreeRoomsByHotel: ids of rooms free for
  // every requested night, not blocked and not reserved (aggregate() does
  // not cast, so hotelId must already be a real Types.ObjectId)
  private async freeRoomIds(
    hotelId: Types.ObjectId | { $in: Types.ObjectId[] },
    nights: Date[],
  ): Promise<Types.ObjectId[]> {
    const rows = await this.availabilityModel.aggregate<{
      _id: Types.ObjectId;
    }>([
      {
        $match: {
          hotelId,
          date: { $in: nights },
          isBlocked: false,
          bookingId: null,
        },
      },
      { $group: { _id: '$roomId', freeNights: { $sum: 1 } } },
      { $match: { freeNights: nights.length } },
    ]);
    return rows.map((row) => row._id);
  }

  // BOOKED wins over BLOCKED; nights that were never opened are not returned
  private toNightView(
    record: {
      date: Date;
      isBlocked: boolean;
      bookingId?: Types.ObjectId | null;
    },
    references: Map<string, string>,
  ): NightView {
    if (record.bookingId) {
      const bookingReference = references.get(record.bookingId.toString());
      return {
        date: record.date,
        status: NightStatus.BOOKED,
        bookingId: record.bookingId,
        ...(bookingReference && { bookingReference }),
      };
    }
    return {
      date: record.date,
      status: record.isBlocked ? NightStatus.BLOCKED : NightStatus.AVAILABLE,
    };
  }
  // Added by Mohamed Hesham: HTL-08. Maps booking id to reference for the booked nights
  // in `records`. A booking that is not confirmed yet has no reference.
  private async findBookingReferences(
    records: { bookingId?: Types.ObjectId | null }[],
  ): Promise<Map<string, string>> {
    const bookingIds = [
      ...new Set(
        records.flatMap((record) =>
          record.bookingId ? [record.bookingId.toString()] : [],
        ),
      ),
    ];
    if (bookingIds.length === 0) return new Map();

    const bookings = await this.bookingModel
      .find({ _id: { $in: bookingIds }, bookingReference: { $exists: true } })
      .select('bookingReference')
      .lean();

    return new Map(
      bookings.map((booking) => [
        booking._id.toString(),
        booking.bookingReference as string,
      ]),
    );
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
