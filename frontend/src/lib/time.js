export function to24Hour(hour, minute, meridiem) {
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);

  if (
    !Number.isInteger(parsedHour) ||
    parsedHour < 1 ||
    parsedHour > 12 ||
    !Number.isInteger(parsedMinute) ||
    parsedMinute < 0 ||
    parsedMinute > 59 ||
    (meridiem !== "AM" && meridiem !== "PM")
  ) {
    throw new RangeError("Enter a valid 12-hour time and choose AM or PM.");
  }

  const hour24 = (parsedHour % 12) + (meridiem === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`;
}

export function format12Hour(value) {
  if (typeof value !== "string") {
    throw new TypeError("Time must be an HH:mm string.");
  }

  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match) throw new RangeError("Time must use HH:mm (24-hour).");

  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${hour24 < 12 ? "AM" : "PM"}`;
}
