import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TenPerPageQueryDto } from './ten-per-page-query.dto.js';

// Created by Mohamed Hesham: GEN-05 (page size 10).
async function errorsFor(query: object) {
  return validate(plainToInstance(TenPerPageQueryDto, query));
}

describe('TenPerPageQueryDto (GEN-05)', () => {
  it('uses page 1 and a limit of 10 by default', async () => {
    const dto = plainToInstance(TenPerPageQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a limit from 1 to 10', async () => {
    expect(await errorsFor({ limit: '1' })).toHaveLength(0);
    expect(await errorsFor({ limit: '10' })).toHaveLength(0);
  });

  it('rejects a limit above 10 (the shared DTO would allow up to 100)', async () => {
    expect(await errorsFor({ limit: '11' })).not.toHaveLength(0);
    expect(await errorsFor({ limit: '100' })).not.toHaveLength(0);
  });

  it('rejects a limit below 1', async () => {
    expect(await errorsFor({ limit: '0' })).not.toHaveLength(0);
  });
});
