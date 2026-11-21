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
    if (duplicate) throw new ConflictException('Hotel already exists in this city');
    return this.hotelModel.create(dto);
  }

  async findOne(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');
    const hotel = await this.hotelModel.findOne({ _id: id, isActive: true }).lean();
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
}
