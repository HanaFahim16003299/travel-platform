import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, ProviderScope } from '../../auth/decorators.js';
import { ProviderType, Role } from '../../common/enums/index.js';
import { imageUploadOptions } from '../../uploads/image-upload.options.js';
import { ImageUploadExceptionFilter } from '../../uploads/image-upload-exception.filter.js';
import { HotelImagesService } from './hotel-images.service.js';

// Added by Mohamed Hesham: HTL-01, HTL-02, GEN-08. The admin (who creates the
// profile) and the hotel's own moderator manage the photos.
@ApiTags('Hotels')
@Controller('hotels/:id/images')
export class HotelImagesController {
  constructor(private readonly hotelImagesService: HotelImagesService) {}

  @Post()
  @ProviderScope(ProviderType.Hotel, 'id', true)
  @Auth(Role.HotelModerator, Role.Admin)
  @UseInterceptors(FileInterceptor('image', imageUploadOptions()))
  @UseFilters(ImageUploadExceptionFilter)
  @ApiOperation({ summary: 'Add a JPG or PNG photo to a hotel' })
  @ApiParam({ name: 'id', description: 'Hotel MongoDB id' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: 'The hotel with its photo added' })
  @ApiBadRequestResponse({
    description:
      'Invalid hotel id, missing file, not a JPG/PNG, over 5 MB, or the hotel already has 5 photos',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found or deactivated' })
  add(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.hotelImagesService.add(id, file);
  }

  @Delete(':filename')
  @ProviderScope(ProviderType.Hotel, 'id', true)
  @Auth(Role.HotelModerator, Role.Admin)
  @ApiOperation({ summary: 'Remove a photo from a hotel' })
  @ApiParam({ name: 'id', description: 'Hotel MongoDB id' })
  @ApiParam({
    name: 'filename',
    description: 'File name of the photo, the last part of its url',
  })
  @ApiOkResponse({ description: 'The hotel without the photo' })
  @ApiBadRequestResponse({ description: 'Invalid hotel id' })
  @ApiNotFoundResponse({ description: 'Hotel or photo not found' })
  remove(@Param('id') id: string, @Param('filename') filename: string) {
    return this.hotelImagesService.remove(id, filename);
  }
}
