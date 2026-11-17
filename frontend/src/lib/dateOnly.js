const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseDateParts(value) {
  if (typeof value !== "string") {
    throw new TypeError("Date-only value must be a YYYY-MM-DD string.");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Date-only value must use YYYY-MM-DD.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    throw new RangeError("Date-only value is not a valid calendar date.");
  }

  return { year, month, day };
}

export function formatDateOnly(value) {
  const { year, month, day } = parseDateParts(value);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function todayDateOnly(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("Current date must be a valid Date object.");
  }
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function compareDateOnly(first, second) {
  parseDateParts(first);
  parseDateParts(second);
  return first < second ? -1 : first > second ? 1 : 0;
}
