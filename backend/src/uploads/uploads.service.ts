import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadsService {
  publicUrl(filename: string): string {
    return `/uploads/${filename}`;
  }
}
