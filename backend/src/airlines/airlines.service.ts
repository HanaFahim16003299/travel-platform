import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Airline, AirlineDocument } from './schemas/airline.schema.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';
import { BaggagePolicyDto } from './dto/baggage-policy.dto.js';
import { CancellationPolicyDto } from './dto/cancellation-policy.dto.js';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
  ) {}

  async create(createAirlineDto: CreateAirlineDto) {
    try {
      return await new this.airlineModel(createAirlineDto).save();
    } catch (error) {
      this.rethrowDuplicateKey(error, 'Airline code');
    }
  }

  async findOne(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Airline not found');
    const airline = await this.airlineModel.findById(id).lean();
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  async update(id: string, dto: UpdateAirlineDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Airline not found');
    let airline;
    try {
      airline = await this.airlineModel
        .findByIdAndUpdate(
          id,
          { $set: dto },
          { new: true, runValidators: true },
        )
        .lean();
    } catch (error) {
      this.rethrowDuplicateKey(error, 'Airline code');
    }
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  async updateBaggagePolicy(id: string, dto: BaggagePolicyDto) {
    return this.updatePolicy(id, 'baggagePolicy', dto);
  }

  async updateCancellationPolicy(id: string, dto: CancellationPolicyDto) {
    return this.updatePolicy(id, 'cancellationPolicy', dto);
  }

  private async updatePolicy(
    id: string,
    policy: 'baggagePolicy' | 'cancellationPolicy',
    dto: BaggagePolicyDto | CancellationPolicyDto,
  ) {
    if (!isValidObjectId(id)) throw new NotFoundException('Airline not found');
    const updates = Object.fromEntries(
      Object.entries(dto).map(([key, value]) => [`${policy}.${key}`, value]),
    );
    const airline = await this.airlineModel
      .findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true },
      )
      .lean();
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  private rethrowDuplicateKey(error: unknown, subject: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(`${subject} already exists`);
    }
    throw error;
  }
}
