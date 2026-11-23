import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Hotel, HotelDocument } from './schemas/hotel.schema.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { UpdatePoliciesDto } from './dto/update-policies.dto.js';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
  ) {}

  async create(dto: CreateHotelDto) {
    const duplicate = await this.hotelModel.exists({
      name: dto.name,
      cityId: dto.cityId,
    });
    if (duplicate)
      throw new ConflictException('Hotel already exists in this city');
    return this.hotelModel.create(dto);
  }

  async findOne(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');
    const hotel = await this.hotelModel
      .findOne({ _id: id, isActive: true })
      .lean();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }
  async update(id: string, dto: UpdateHotelDto) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');

    const hotel = await this.hotelModel.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: dto },
      { new: true, runValidators: true },
    );

    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  // HTL-09, HTL-10: PUT replaces check-in/out times and the cancellation policy
  async updatePolicies(id: string, dto: UpdatePoliciesDto) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');

    const days = dto.cancellationTiers.map((tier) => tier.daysBeforeCheckIn);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException(
        'cancellationTiers cannot share the same daysBeforeCheckIn',
      );
    }

    const cancellationTiers = [...dto.cancellationTiers].sort(
      (a, b) => b.daysBeforeCheckIn - a.daysBeforeCheckIn,
    );

    const hotel = await this.hotelModel.findOneAndUpdate(
      { _id: id, isActive: true },
      {
        $set: {
          checkInTime: dto.checkInTime,
          checkOutTime: dto.checkOutTime,
          'policies.cancellationTiers': cancellationTiers,
        },
      },
      { new: true, runValidators: true },
    );

    if (!hotel) throw new NotFoundException('Hotel not found');

    return {
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: hotel.policies.cancellationTiers,
    };
  }
}
