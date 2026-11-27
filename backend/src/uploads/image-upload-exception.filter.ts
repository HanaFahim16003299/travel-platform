import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

// Moved from the blog module by Mohamed Hesham so hotels can reuse it (GEN-08).
// Multer reports a too-big file as 413; the API answers 400 like every other
// rejected image.
@Catch(PayloadTooLargeException)
export class ImageUploadExceptionFilter implements ExceptionFilter<PayloadTooLargeException> {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(400).json({
      statusCode: 400,
      message: 'Image must be 5 MB or smaller',
      error: 'Bad Request',
    });
  }
}
