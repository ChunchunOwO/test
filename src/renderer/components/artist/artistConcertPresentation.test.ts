import { describe, expect, it } from 'vitest';
import type { ArtistConcertEvent } from '../../../shared/types/library';
import {
  concertLocation,
  concertSecondaryInfo,
  formatConcertDateParts,
  formatConcertTime,
} from './artistConcertPresentation';

const event = (overrides: Partial<ArtistConcertEvent> = {}): ArtistConcertEvent => ({
  id: 'event-1',
  source: 'eventernote',
  title: 'Echo Unit Live',
  startsAt: '2026-08-29T18:00:00',
  timezone: 'Asia/Tokyo',
  timeTbd: false,
  venueName: 'Echo Arena',
  city: 'Tokyo',
  region: 'Tokyo',
  country: 'Japan',
  url: null,
  ...overrides,
});

describe('artist concert presentation', () => {
  it('preserves provider-local calendar values for timestamps without an offset', () => {
    const value = event();

    expect(formatConcertDateParts(value, 'en-US')).toMatchObject({
      day: '29',
      month: 'Aug',
      year: '2026',
    });
    expect(formatConcertTime(value, 'en-US')).toBe('18:00');
  });

  it('formats offset timestamps in the venue timezone', () => {
    const value = event({
      startsAt: '2026-06-01T11:00:00Z',
      timezone: 'Asia/Hong_Kong',
    });

    expect(formatConcertDateParts(value, 'en-US')).toMatchObject({
      day: '1',
      month: 'Jun',
      year: '2026',
    });
    expect(formatConcertTime(value, 'en-US')).toBe('19:00');
  });

  it('keeps time-to-be-announced events distinct from midnight', () => {
    expect(formatConcertTime(event({ timeTbd: true }), 'en-US')).toBeNull();
  });

  it('builds a compact location and secondary summary without duplicates', () => {
    const value = event();

    expect(concertLocation(value, 'Venue pending')).toBe('Echo Arena');
    expect(concertSecondaryInfo(value)).toBe('Echo Unit Live / Tokyo / Japan');
  });
});
