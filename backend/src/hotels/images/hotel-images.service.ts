import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Hotel, type HotelDocument } from '../schemas/hotel.schema.js';
import { UploadsService } from '../../uploads/uploads.service.js';
import { deleteStoredImage } from '../../uploads/stored-image.js';
import { MAX_IMAGES_PER_HOTEL } from '../constants/max-images.js';

// Added by Mohamed Hesham: HTL-01, HTL-02, GEN-08. Hotel photos are stored as
// public urls ("/uploads/<file>") in the hotel's images array. The upload
// options already rejected anything that is not a JPG/PNG of at most 5 MB.
@Injectable()
export class HotelImagesService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    private readonly uploads: UploadsService,
  ) {}

  async add(hotelId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');

    try {
      this.assertValidId(hotelId);
      // the filter only matches while the last slot is still free, so two
      // uploads at the same time can never push a hotel past the limit
      const hotel = await this.hotelModel
        .findOneAndUpdate(
          {
            _id: hotelId,
            isActive: true,
            [`images.${MAX_IMAGES_PER_HOTEL - 1}`]: { $exists: false },
          },
          { $push: { images: this.uploads.publicUrl(file.filename) } },
          { new: true },
        )
        .lean();
      if (hotel) return hotel;

      if (!(await this.hotelModel.exists({ _id: hotelId, isActive: true })))
        throw new NotFoundException('Hotel not found');
      throw new BadRequestException(
        `A hotel can have at most ${MAX_IMAGES_PER_HOTEL} images`,
      );
    } catch (error) {
      // the file is already on disk, so a rejected upload must not leave it behind
      await deleteStoredImage(file.filename);
      throw error;
    }
  }

  async remove(hotelId: string, filename: string) {
    this.assertValidId(hotelId);
    const url = this.uploads.publicUrl(filename);
    const hotel = await this.hotelModel
      .findOneAndUpdate(
        { _id: hotelId, isActive: true, images: url },
        { $pull: { images: url } },
        { new: true },
      )
      .lean();
    if (!hotel) throw new NotFoundException('Hotel or image not found');

    await deleteStoredImage(filename);
    return hotel;
  }

  private assertValidId(hotelId: string) {
    if (!isValidObjectId(hotelId)) throw new BadRequestException('Invalid id');
  }
}
