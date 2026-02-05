export function isFiveMinuteIncrement(time: string): boolean {
  const parts = time.split(":");
  if (parts.length < 2) {
    return false;
  }
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(minutes)) {
    return false;
  }
  return minutes % 5 === 0;
}

export function isValidTime(time: string): boolean {
  const match = /^\d{2}:\d{2}(:\d{2})?$/.test(time);
  if (!match) {
    return false;
  }
  const [hourStr, minuteStr, secondStr] = time.split(":");
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  const second = secondStr ? Number.parseInt(secondStr, 10) : 0;
  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) {
    return false;
  }
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}
