import CalendarClient from "./CalendarClient";

export const metadata = { title: "Calendar · NextKey CRM" };

/**
 * The CRM's own calendar. A month/week grid over the Supabase `appointments`
 * table (the CRM is the system of record — no Google Calendar). Meetings booked
 * from an opportunity land here, carry a self-hosted LiveKit video link, and the
 * attendee gets a Brevo email invite with an .ics attachment.
 */
export default function CalendarPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">
          Meetings scheduled from the CRM. Video meetings use the built-in LiveKit
          room; invites are emailed with a calendar attachment.
        </p>
      </div>
      <CalendarClient />
    </div>
  );
}
