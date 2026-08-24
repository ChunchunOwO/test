import type { ArtistConcertEvent } from '../../../shared/types/library';

type ConcertDateParts = {
  day: string;
  label: string;
  month: string;
  weekday: string;
  year: string;
};

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/u;
const explicitTimezonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/iu;

const localDateTimeMatch = (value: string): RegExpMatchArray | null =>
  explicitTimezonePattern.test(value) ? null : value.match(localDateTimePattern);

const formatParts = (
  date: Date,
  locale: string,
  timeZone: string | undefined,
): ConcertDateParts => {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  };
  const formatter = new Intl.DateTimeFormat(locale, options);
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: read('day'),
    label: formatter.format(date),
    month: read('month'),
    weekday: read('weekday'),
    year: read('year'),
  };
};

export const formatConcertDateParts = (
  event: Pick<ArtistConcertEvent, 'startsAt' | 'timezone'>,
  locale: string,
): ConcertDateParts => {
  const localMatch = localDateTimeMatch(event.startsAt);
  if (localMatch) {
    const [, year, month, day, hour = '00', minute = '00'] = localMatch;
    const localDate = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ));
    return formatParts(localDate, locale, 'UTC');
  }

  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) {
    return { day: event.startsAt, label: event.startsAt, month: '', weekday: '', year: '' };
  }

  try {
    return formatParts(date, locale, event.timezone ?? undefined);
  } catch {
    return formatParts(date, locale, undefined);
  }
};

export const formatConcertTime = (
  event: Pick<ArtistConcertEvent, 'startsAt' | 'timeTbd' | 'timezone'>,
  locale: string,
): string | null => {
  if (event.timeTbd) {
    return null;
  }

  const localMatch = localDateTimeMatch(event.startsAt);
  if (localMatch?.[4] && localMatch[5]) {
    return `${localMatch[4]}:${localMatch[5]}`;
  }

  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    ...(event.timezone ? { timeZone: event.timezone } : {}),
  };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    delete options.timeZone;
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
};

export const concertSourceName = (source: ArtistConcertEvent['source']): string => {
  const labels: Record<ArtistConcertEvent['source'], string> = {
    bandsintown: 'Bandsintown',
    eplus: 'eplus',
    eventernote: 'Eventernote',
    seatgeek: 'SeatGeek',
    songkick: 'Songkick',
    ticketmaster: 'Ticketmaster',
  };
  return labels[source];
};

export const concertLocation = (event: ArtistConcertEvent, fallback: string): string =>
  event.venueName || event.city || event.region || event.country || fallback;

export const concertSecondaryInfo = (event: ArtistConcertEvent): string =>
  [
    event.title,
    event.city && event.city !== event.venueName ? event.city : null,
    event.region && event.region !== event.city ? event.region : null,
    event.country && event.country !== event.city && event.country !== event.region ? event.country : null,
  ].filter(Boolean).join(' / ');
