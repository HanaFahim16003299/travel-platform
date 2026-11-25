// The bridge between pure rules and HTTP: rule says "this is wrong", we answer 400.
import { BadRequestException } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { toUtcDay } from '../domain/dates.js';

/** A validator returned a message -> 400 with that message. null -> nothing happens. */
export function rejectIf(message: string | null): void {
  if (message) throw new BadRequestException(message);
}

export function assertObjectId(id: string, label = 'id'): void {
  if (!isValidObjectId(id)) throw new BadRequestException(`Invalid ${label}`);
}

/** "YYYY-MM-DD" -> Date, or 400 if it isn't a real calendar date. */
export function parseDay(value: string, field: string): Date {
  const date = toUtcDay(value);
  if (!date) throw new BadRequestException(`${field} is not a real calendar date`);
  return date;
}
//Your domain/ rules only say what's wrong, as a message. This file tells the user, as an HTTP 400 error.