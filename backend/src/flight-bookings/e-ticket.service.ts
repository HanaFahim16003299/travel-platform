import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import PDFDocument from 'pdfkit';
import type { FlightBookingDocument } from './schemas/flight-booking.schema.js';

type AirportInfo = { code: string; timeZone: string };

/** Builds the PDF e-ticket (FLT-23). Times are printed in each airport's own time zone. */
@Injectable()
export class ETicketService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Reads airports from Hana's seeded "airports" collection; falls back to UTC if missing. */
  private async loadAirports(ids: Types.ObjectId[]): Promise<Map<string, AirportInfo>> {
    const map = new Map<string, AirportInfo>();
    try {
      const docs = await this.connection
        .collection('airports')
        .find({ _id: { $in: ids } })
        .toArray();
      for (const a of docs) {
        const code = String(a.iataCode ?? a.iata ?? a.code ?? a.name ?? a._id);
        const timeZone = String(a.timeZone ?? a.timezone ?? a.tz ?? 'UTC');
        map.set(String(a._id), { code, timeZone });
      }
    } catch {
      // no airports collection yet: fall back below
    }
    return map;
  }

  private formatTime(date: Date, timeZone: string) {
    try {
      return (
        new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(date) +
        ` (${timeZone})`
      );
    } catch {
      return date.toISOString().replace('T', ' ').slice(0, 16) + ' (UTC)';
    }
  }

  async build(b: FlightBookingDocument): Promise<Buffer> {
    const airportIds = b.segments.flatMap((s) => [s.departureAirportId, s.arrivalAirportId]);
    const airports = await this.loadAirports(airportIds);
    const airport = (id: Types.ObjectId): AirportInfo =>
      airports.get(String(id)) ?? { code: String(id), timeZone: 'UTC' };

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(22).text('E-Ticket', { align: 'center' }).moveDown();
      doc.fontSize(14).text(`Booking reference: ${b.bookingReference ?? ''}`);
      doc.fontSize(10).text(`Issued: ${b.confirmedAt ? b.confirmedAt.toUTCString() : ''}`).moveDown();

      doc.fontSize(14).text('Flights');
      b.segments.forEach((s, i) => {
        const from = airport(s.departureAirportId);
        const to = airport(s.arrivalAirportId);
        doc
          .fontSize(11)
          .text(`${i === 0 ? 'Outbound' : 'Return'}: ${s.flightNumber}  |  Cabin: ${s.cabinClass}`)
          .text(`From ${from.code}: ${this.formatTime(s.departureAt, from.timeZone)}`)
          .text(`To   ${to.code}: ${this.formatTime(s.arrivalAt, to.timeZone)}`)
          .text(
            `Free checked bags: ${s.freeCheckedBags}${s.checkedBagWeightKg ? ` × ${s.checkedBagWeightKg} kg` : ''}`,
          )
          .moveDown(0.5);
      });

      doc.moveDown().fontSize(14).text('Passengers');
      b.passengers.forEach((p) =>
        doc
          .fontSize(11)
          .text(`${p.firstName} ${p.lastName} (${p.type})  Ticket: ${p.ticketNumber ?? '-'}  Extra bags: ${p.extraBags}`),
      );

      doc.moveDown().fontSize(12).text(`Total paid: ${b.totalPrice} ${b.currency}`);
      doc.end();
    });
  }
}
