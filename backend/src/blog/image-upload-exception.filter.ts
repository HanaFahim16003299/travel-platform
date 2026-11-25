import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(BadRequestException, PayloadTooLargeException)
export class ImageUploadExceptionFilter
  implements ExceptionFilter<BadRequestException | PayloadTooLargeException>
{
  catch(
    exception: BadRequestException | PayloadTooLargeException,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof PayloadTooLargeException) {
      return response.status(400).json({
        statusCode: 400,
        message: 'Image must be 5 MB or smaller',
        error: 'Bad Request',
      });
    }

    if (exception.message === 'Only JPEG, PNG and WebP images are allowed') {
      return response.status(400).json({
        statusCode: 400,
        message: 'Only JPEG and PNG images are allowed',
        error: 'Bad Request',
      });
    }

    return response.status(exception.getStatus()).json(exception.getResponse());
  }
}
