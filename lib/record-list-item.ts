import type { WorkRecord } from "./types";

/** Only what the dashboard list displays. Private fields (email, amount) stay on the server. */
export type RecordListItem = Pick<WorkRecord, "id" | "title" | "startDate" | "endDate" | "status"> & {
  client: { name: string; organization?: string };
};

export function toRecordListItem(record: WorkRecord): RecordListItem {
  return {
    id: record.id,
    title: record.title,
    startDate: record.startDate,
    endDate: record.endDate,
    status: record.status,
    client: { name: record.client.name, organization: record.client.organization },
  };
}
