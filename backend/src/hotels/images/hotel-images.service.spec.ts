import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HotelImagesService } from './hotel-images.service.js';
import { deleteStoredImage } from '../../uploads/stored-image.js';

// Tests written by Mohamed Hesham for HTL-01, HTL-02 and GEN-08.
vi.mock('../../uploads/stored-image.js', () => ({
  deleteStoredImage: vi.fn().mockResolvedValue(undefined),
}));

const HOTEL_ID = '507f1f77bcf86cd799439011';
const FILE = { filename: 'abc.jpg' } as Express.Multer.File;
const URL = '/uploads/abc.jpg';

// findOneAndUpdate(...).lean() is how the service reads the updated hotel
function leanResult(result: unknown) {
  return { lean: vi.fn().mockResolvedValue(result) };
}

describe('HotelImagesService', () => {
  let hotelModel: {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
  };
  let uploads: { publicUrl: ReturnType<typeof vi.fn> };
  let service: HotelImagesService;

  beforeEach(() => {
    vi.mocked(deleteStoredImage).mockClear();
    hotelModel = { findOneAndUpdate: vi.fn(), exists: vi.fn() };
    uploads = { publicUrl: vi.fn((name: string) => `/uploads/${name}`) };
    service = new HotelImagesService(hotelModel as never, uploads as never);
  });

  describe('add (HTL-01, GEN-08)', () => {
    it('throws 400 when no file was sent', async () => {
      await expect(service.add(HOTEL_ID, undefined)).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 400 for an invalid id and removes the uploaded file', async () => {
      await expect(service.add('not-an-id', FILE)).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(deleteStoredImage).toHaveBeenCalledWith('abc.jpg');
    });

    it('pushes the public url onto an active hotel that still has a free slot (max 5)', async () => {
      const updated = { _id: HOTEL_ID, images: [URL] };
      hotelModel.findOneAndUpdate.mockReturnValue(leanResult(updated));

      const result = await service.add(HOTEL_ID, FILE);

      expect(hotelModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: HOTEL_ID, isActive: true, 'images.4': { $exists: false } },
        { $push: { images: URL } },
        { new: true },
      );
      expect(result).toBe(updated);
      expect(deleteStoredImage).not.toHaveBeenCalled();
    });

    it('throws 400 and removes the file when the hotel already has 5 photos', async () => {
      hotelModel.findOneAndUpdate.mockReturnValue(leanResult(null));
      hotelModel.exists.mockResolvedValue({ _id: HOTEL_ID });

      await expect(service.add(HOTEL_ID, FILE)).rejects.toThrow(
        'A hotel can have at most 5 images',
      );
      expect(deleteStoredImage).toHaveBeenCalledWith('abc.jpg');
    });

    it('throws 404 and removes the file when the hotel does not exist or is inactive', async () => {
      hotelModel.findOneAndUpdate.mockReturnValue(leanResult(null));
      hotelModel.exists.mockResolvedValue(null);

      await expect(service.add(HOTEL_ID, FILE)).rejects.toThrow(
        NotFoundException,
      );
      expect(hotelModel.exists).toHaveBeenCalledWith({
        _id: HOTEL_ID,
        isActive: true,
      });
      expect(deleteStoredImage).toHaveBeenCalledWith('abc.jpg');
    });
  });

  describe('remove (HTL-01, GEN-08)', () => {
    it('throws 400 for an invalid id without querying', async () => {
      await expect(service.remove('not-an-id', 'abc.jpg')).rejects.toThrow(
        BadRequestException,
      );
      expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 and keeps the file when the hotel does not have that photo', async () => {
      hotelModel.findOneAndUpdate.mockReturnValue(leanResult(null));

      await expect(service.remove(HOTEL_ID, 'abc.jpg')).rejects.toThrow(
        NotFoundException,
      );
      expect(deleteStoredImage).not.toHaveBeenCalled();
    });

    it('pulls the url from an active hotel, then deletes the stored file', async () => {
      const updated = { _id: HOTEL_ID, images: [] };
      hotelModel.findOneAndUpdate.mockReturnValue(leanResult(updated));

      const result = await service.remove(HOTEL_ID, 'abc.jpg');

      expect(hotelModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: HOTEL_ID, isActive: true, images: URL },
        { $pull: { images: URL } },
        { new: true },
      );
      expect(deleteStoredImage).toHaveBeenCalledWith('abc.jpg');
      expect(result).toBe(updated);
    });
  });
});
