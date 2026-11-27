// PURE: ITN-09 city grouping. Always computed from the current order, so it can never be stale.

export interface CityGroup {
  cityId: string;
  fromDay: number;
  toDay: number;
  startDate: Date;
  endDate: Date;
  /** Nights in this city = days spent there (you check out the morning after endDate). */
  nights: number;
  dayIds: string[];
}

/**
 * Consecutive days in the same city become one group.
 * Berlin, Berlin, Munich, Berlin -> [Berlin 1-2], [Munich 3], [Berlin 4].
 */
export function groupDaysByCity(
  days: { _id?: unknown; cityId: unknown; dayNumber: number; date: Date }[],
): CityGroup[] {
  return days.reduce<CityGroup[]>((groups, day) => {
    const cityId = String(day.cityId);
    const last = groups.at(-1);
    if (last && last.cityId === cityId) {
      // same city as yesterday: stretch the current group (build a new object, don't mutate)
      return [
        ...groups.slice(0, -1),
        {
          ...last,
          toDay: day.dayNumber,
          endDate: day.date,
          nights: last.nights + 1,
          dayIds: [...last.dayIds, String(day._id)],
        },
      ];
    }
    return [
      ...groups,
      {
        cityId,
        fromDay: day.dayNumber,
        toDay: day.dayNumber,
        startDate: day.date,
        endDate: day.date,
        nights: 1,
        dayIds: [String(day._id)],
      },
    ];
  }, []);
}