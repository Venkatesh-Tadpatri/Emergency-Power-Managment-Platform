import type { Alarm } from "../types/entities";

const EVENT_PATTERN = /\btest\b|generator\s+(running|started|stopped)|\bcompleted\b|restored|returned\s+to\s+normal/i;
const ALARM_PATTERN = /fault|fail(?:ed|ure)?|alarm|emergency|loss|low|high|over|under|trip|offline|communication|unavailable/i;

/** Operational/test activity belongs in Events unless the message describes a failure condition. */
export function isOperationalEvent(record: Pick<Alarm, "message">): boolean {
  return EVENT_PATTERN.test(record.message) && !ALARM_PATTERN.test(record.message);
}

export function isNotification(record: Pick<Alarm, "message" | "severity">): boolean {
  return record.severity === "info" && !isOperationalEvent(record);
}

export function alarmOnly(records: Alarm[] | undefined): Alarm[] {
  return (records || []).filter((record) => !isOperationalEvent(record) && !isNotification(record));
}

export function eventOnly(records: Alarm[] | undefined): Alarm[] {
  return (records || []).filter(isOperationalEvent);
}

export function notificationOnly(records: Alarm[] | undefined): Alarm[] {
  return (records || []).filter(isNotification);
}

export function activeAlarmOnly(records: Alarm[] | undefined): Alarm[] {
  return alarmOnly(records).filter((record) => record.status === "active");
}
