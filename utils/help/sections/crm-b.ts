import type { HelpSection } from "../types";

/**
 * Help content for the second half of the CRM sidebar group, plus the pinned
 * "Feedback & issues" button and video calls.
 *
 * Every step names a control exactly as it reads on screen (emoji left out),
 * because each guide is also recorded as a screen video. If a label changes in
 * the page, change it here too.
 */
export const crmBSections: HelpSection[] = [
  // ─────────────────────────────────────────────────────────── Shared Folder
  {
    label: "Shared Folder",
    paths: ["/shared-folder"],
    about:
      "A shared file library that everyone who can sign in to the CRM can view, add to and tidy up.",
    guides: [
      {
        id: "shared-folder-upload-files",
        title: "Upload files to the Shared Folder",
        summary:
          "Add documents so the whole team can find them, for example a signed form or a builder price list.",
        steps: [
          {
            title: 'Click "Shared Folder" in the sidebar',
            detail: "It is in the CRM group.",
          },
          {
            title: "Click a folder name to open the folder you want",
            detail: "The trail above the list shows where you are. Click any name in it to go back up.",
          },
          {
            title: 'Click "Upload files"',
            detail: "It is the first button above the list. You can also drag files from your computer onto the page.",
          },
          {
            title: "Choose one or more files and confirm",
            detail: "Each file shows as “Uploading…” until it is finished. The size limit is shown under the list.",
          },
          {
            title: "Check the files appear in the list",
            detail: "If a file shows a warning instead, read the message beside it, close it with the ✕ and try again.",
          },
        ],
      },
      {
        id: "shared-folder-new-folder",
        title: "Create a new folder",
        summary: "Make a folder to keep related files together, such as one per client or per builder.",
        steps: [
          {
            title: "Open the folder that the new folder should sit inside",
            detail: "Stay on the top level if you want it at the top.",
          },
          {
            title: 'Click "New folder"',
            detail: "A small box opens under the buttons.",
          },
          {
            title: 'Type the name in the "Folder name" box',
          },
          {
            title: 'Click "Create"',
            detail: "The folder appears in the list. Click its name to open it.",
          },
        ],
      },
      {
        id: "shared-folder-find-open",
        title: "Find, view or download a file",
        summary: "Search every folder at once, then open the file in your browser or save a copy.",
        steps: [
          {
            title: 'Type part of the file name in the "Search all folders…" box and press Enter',
            detail: "The heading changes to show what you searched for.",
          },
          {
            title: 'Click "View" on the row to open the file in a new tab',
            detail: "View only shows for file types the browser can display, such as PDFs and images.",
          },
          {
            title: 'Click "Download" to save a copy to your computer',
          },
          {
            title: 'Click "Clear" next to the search box to go back to the folders',
          },
        ],
      },
      {
        id: "shared-folder-tidy-up",
        title: "Rename, move, delete or restore a file",
        summary: "Keep the library tidy, and get back something that was deleted by mistake.",
        steps: [
          {
            title: 'Click "Rename" on the row, type the new name, then click "Save"',
          },
          {
            title: 'Click "Move" on the row, then pick a folder from the "Move to…" list',
            detail: "The file moves as soon as you pick a folder.",
          },
          {
            title: 'Click "Delete" on the row to remove a file or folder',
            detail: "There is no confirmation. The item goes straight to the Trash, where anyone can restore it.",
          },
          {
            title: 'Click "Trash" at the top right to see deleted items',
          },
          {
            title: 'Click "Restore" to put an item back',
          },
          {
            title: 'Click "Delete forever", then "Confirm", only if you are sure',
            detail: "This cannot be undone.",
          },
          {
            title: 'Click "Back to files" to leave the Trash',
          },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────── Contacts
  {
    label: "Contacts",
    paths: ["/contacts"],
    about:
      "Every person in the CRM, with their details, notes, emails, meetings and the opportunities they belong to.",
    guides: [
      {
        id: "contacts-add-new",
        title: "Add a new contact",
        summary: "Create one contact by hand, for example while you are on the phone with them.",
        steps: [
          {
            title: 'Click "+ New Contact"',
            detail: "It is the blue button at the top right of the Contacts page.",
          },
          {
            title: 'Fill in "Full name" and "Email"',
            detail: "Both are required. The email is how the CRM matches this person later.",
          },
          {
            title: 'Add "Phone", "Buyer type", "Preferred state", "Timeframe" and "Temperature" if you know them',
            detail: "These are optional and can be added later.",
          },
          {
            title: 'Click "Add contact"',
            detail: "The new contact's page opens.",
          },
          {
            title: 'If you see a yellow message, click "Open the existing contact →"',
            detail: "That email is already in the CRM, so no duplicate was made.",
          },
        ],
      },
      {
        id: "contacts-find-filter-export",
        title: "Find, filter and export contacts",
        summary: "Narrow the list to the people you need, open one, or save the list as a spreadsheet.",
        steps: [
          {
            title: 'Type in the "Search name, email, phone, tags…" box',
            detail: "The list narrows as you type.",
          },
          {
            title: 'Click a type under "Contact Types" on the left, such as "Investor"',
            detail: 'Click "All Contacts" to clear it.',
          },
          {
            title: 'Use the "All temperatures", "All statuses" and "All tags" dropdowns to narrow further',
          },
          {
            title: 'Change the "Sort: Last updated" dropdown to reorder the list',
          },
          {
            title: 'Click "Load more" at the bottom of the list if the person is not showing',
            detail: "Search and filters only look through the contacts that have been loaded so far.",
          },
          {
            title: "Click a row to open that contact",
          },
          {
            title: 'Click "Export CSV" to download the list you are looking at',
            detail: "Tick the boxes on the left first if you only want certain rows.",
          },
        ],
      },
      {
        id: "contacts-update-and-email",
        title: "Update a contact, add a note or send them an email",
        summary: "Keep a contact's record current and write to them from their own page.",
        steps: [
          {
            title: "Click the contact's row on the Contacts page",
            detail: "Their page opens.",
          },
          {
            title: 'Click "Edit" at the top, change the details, then click "Save changes"',
          },
          {
            title: 'Click the "Notes" tab and type in the box',
          },
          {
            title: 'Click "Save"',
            detail: "The note also saves by itself when you click outside the box.",
          },
          {
            title: 'Click "Send Email" at the top',
            detail: "This button only shows when the contact has an email address.",
          },
          {
            title: 'Fill in "Subject" and "Message"',
            detail: 'Click "AI Draft" if you want a first draft written for you. Your signature is added for you.',
          },
          {
            title: 'Click "Send"',
            detail: "This sends a real email to the client straight away and cannot be recalled.",
          },
        ],
      },
      {
        id: "contacts-bulk-upload",
        title: "Import a list of contacts from a file",
        summary: "Load many contacts at once from a spreadsheet or a phone contacts export.",
        steps: [
          {
            title: 'Click "Bulk Upload"',
            detail: "It is at the top right, next to New Contact.",
          },
          {
            title: 'Click "Choose File" and pick your file',
            detail: "It accepts .csv, .xlsx, .xls and .vcf files. Click “Download Template” if you need a sample layout.",
          },
          {
            title: 'Pick a type under "Assign Contact Type" if every person in the file is the same type',
            detail: "This is optional.",
          },
          {
            title: 'Check the "Maps To" column and fix any that are wrong',
            detail: "Each row shows one column from your file and where it will go in the CRM.",
          },
          {
            title: 'Click "Preview Import →"',
            detail: "You will see how many rows are valid and how many will be skipped.",
          },
          {
            title: 'Click the "Import … Contacts" button',
            detail: "A progress bar shows while the contacts are added.",
          },
          {
            title: 'Click "Close"',
            detail: "The page reloads with the new contacts in the list.",
          },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────── Calendar
  {
    label: "Calendar",
    paths: ["/calendar"],
    about: "A month or week view of every meeting booked in the CRM.",
    guides: [
      {
        id: "calendar-view-meetings",
        title: "See what meetings are coming up",
        summary: "Check the day, week or month ahead and open any meeting for its details.",
        steps: [
          {
            title: 'Click "Calendar" in the sidebar',
          },
          {
            title: 'Click "Month" or "Week" at the top right to change the view',
            detail: "Week lists each day's meetings in order.",
          },
          {
            title: 'Use the "‹" and "›" arrows to move back and forward',
            detail: 'Click "Today" to jump back to now.',
          },
          {
            title: "Click a meeting to open its details",
            detail: "You will see the time, the client, who is hosting and any notes. Cancelled meetings show in red with a line through them.",
          },
          {
            title: "Click the client's name to open their contact page",
          },
          {
            title: 'Click "Join video meeting" if it is a video meeting',
            detail: "The call opens in a new tab.",
          },
          {
            title: 'Click "✕" to close the details',
          },
        ],
      },
      {
        id: "calendar-schedule-meeting",
        title: "Book a new meeting",
        summary:
          "Meetings are booked from the client's contact page, not from the Calendar itself. Once booked they show here.",
        steps: [
          {
            title: 'Click "Contacts" in the sidebar and open the client',
          },
          {
            title: 'Click "Schedule meeting" at the top of their page',
          },
          {
            title: 'Choose the "Meeting host", "Date", "Start" time and "Duration"',
          },
          {
            title: 'Check the "Title" and "Attendee email"',
            detail: "Both are filled in for you. Change them if needed.",
          },
          {
            title: 'Leave "Send invite email to attendee" ticked to email the client',
            detail: "The client is emailed an invite with the video link. Untick it if you do not want them emailed.",
          },
          {
            title: 'Click "Schedule meeting"',
          },
          {
            title: "Read the result message",
            detail: "If it says the invite was NOT sent, the meeting is saved but you need to send the link to the client yourself.",
          },
          {
            title: 'Click "Close"',
            detail: "The meeting now shows on the Calendar.",
          },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── Appointments
  {
    label: "Appointments",
    paths: ["/appointments"],
    about:
      "A list of upcoming, recent and cancelled meetings, plus the old booking history kept for reference.",
    guides: [
      {
        id: "appointments-review-upcoming",
        title: "Check upcoming and recent meetings",
        summary: "See who you are meeting next and look back over the last 30 days.",
        steps: [
          {
            title: 'Click "Appointments" in the sidebar',
          },
          {
            title: "Read the four boxes at the top",
            detail: "They count Upcoming, Past (30d), Cancelled (30d) and Archive meetings.",
          },
          {
            title: 'Look through the "Upcoming" list',
            detail: "The soonest meeting is first. Each row shows the client, the host and the time.",
          },
          {
            title: "Click a client's name to open their contact page",
          },
          {
            title: 'Click "Join meeting →" on a video meeting to open the call',
            detail: "It opens in a new tab.",
          },
          {
            title: 'Scroll down for "Past 30 days", "Cancelled" and the GHL Archive',
            detail: "This page is for reading only. To book a meeting, open the client in Contacts and click “Schedule meeting”.",
          },
        ],
      },
      {
        id: "appointments-pre-meeting-brief",
        title: "Get a quick brief before a meeting",
        summary: "Have the CRM write a short summary of the client so you are ready for the call.",
        steps: [
          {
            title: 'Find the meeting in the "Upcoming" list',
          },
          {
            title: 'Click "Brief" under the meeting',
            detail: "It takes a few seconds to write.",
          },
          {
            title: 'Read the "Pre-meeting brief" box',
          },
          {
            title: 'Click "close" in the corner of the box when you are done',
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────── Inbox
  {
    label: "Inbox",
    paths: ["/inbox"],
    about: "Your CRM email: read and reply to client emails, write new ones and file them away.",
    guides: [
      {
        id: "inbox-read-and-reply",
        title: "Read and reply to an email",
        summary: "Open a conversation, read it and send a reply from the CRM.",
        steps: [
          {
            title: 'Click "Inbox" in the sidebar',
            detail: "Conversations with new messages show a blue “new” badge.",
          },
          {
            title: "Click a conversation to open it",
            detail: "All the messages in it open underneath and it is marked as read.",
          },
          {
            title: 'Click "Reply" on the message you are answering',
            detail: "Reply shows on messages you have received.",
          },
          {
            title: 'Type your reply in the "Message" box',
            detail: 'The address and subject are filled in. Click "AI Draft" if you want a first draft.',
          },
          {
            title: 'Click "Send"',
            detail: "This sends a real email straight away and cannot be recalled.",
          },
          {
            title: 'Click "Open contact for full context →" to see the client\'s whole record',
            detail: "This link shows when the email is matched to a contact.",
          },
        ],
      },
      {
        id: "inbox-compose-new",
        title: "Write and send a new email",
        summary: "Send a fresh email, with attachments if you need them.",
        steps: [
          {
            title: 'Click "Compose"',
            detail: "It is the button at the top of the mail list on the left.",
          },
          {
            title: 'Choose which business to send from in the "From" dropdown',
            detail: "The signature in the message changes to match.",
          },
          {
            title: 'Type the address in the "To" box',
            detail: 'Separate several addresses with commas. Click "+ Cc / Bcc" to add copies.',
          },
          {
            title: 'Type a "Subject", then write your message in the large box',
            detail: "Type above the signature. Use the B, I and U buttons for bold, italic and underline.",
          },
          {
            title: "Click the paperclip to attach files",
            detail: "You can also drag files onto the message.",
          },
          {
            title: 'Click "Send"',
            detail: "This sends a real email straight away and cannot be recalled. You are taken to Sent.",
          },
          {
            title: 'Click "Discard" instead if you change your mind',
            detail: "Your work saves as a draft as you type, so you can also leave and finish it later from Drafts.",
          },
        ],
      },
      {
        id: "inbox-organise",
        title: "Tidy up your inbox",
        summary: "Archive, star, bin or file conversations so the inbox only shows what still needs you.",
        steps: [
          {
            title: "Tick the box beside one or more conversations",
            detail: "A dark bar appears above the list. Tick the box in the heading row to select them all.",
          },
          {
            title: 'Click "Archive" to clear them out of the inbox but keep them',
            detail: "Find them later under Archive on the left.",
          },
          {
            title: 'Click "Star" to flag them, or "Mark read" and "Mark unread" to change the new badge',
          },
          {
            title: 'Click "Trash" or "Spam" to get rid of them',
            detail: "Trash and Spam are emptied for good after 30 days.",
          },
          {
            title: 'To make a folder, click "+ New" beside "Folders" on the left, type a name and press Enter',
          },
          {
            title: 'Click "Move to…" in the dark bar and pick the folder',
            detail: "The ticked conversations are filed in that folder.",
          },
        ],
      },
      {
        id: "inbox-search-and-drafts",
        title: "Search your mail and finish a draft",
        summary: "Find an old email, or pick up a message you started earlier.",
        steps: [
          {
            title: 'Type in the "Search mail…" box',
            detail: "Results appear after a moment. It searches the list you are in, such as Inbox or Sent.",
          },
          {
            title: 'Click "✕" in the search box to clear the search',
          },
          {
            title: 'Click "Sent" on the left to see emails you have sent',
          },
          {
            title: 'Click "Drafts" on the left to see unfinished messages',
          },
          {
            title: "Click a draft to open it and keep writing",
          },
          {
            title: "Click the bin icon on a draft to throw it away",
            detail: "You are asked to confirm. A discarded draft cannot be recovered.",
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────── Broadcast
  {
    label: "Broadcast",
    paths: ["/broadcast"],
    about: "Send one email to all your contacts, or to everyone with a particular tag.",
    guides: [
      {
        id: "broadcast-send-email",
        title: "Send an email to a group of contacts",
        summary:
          "Send a one-off update to many people at once. The wording is checked against Australian rules before anything goes out.",
        steps: [
          {
            title: 'Choose the business in the "Send as …" dropdown',
            detail: "This sets who the email comes from. Make sure it is the right brand for this audience.",
          },
          {
            title: "Choose who gets it in the dropdown below",
            detail: 'Pick "All contacts" or a tag. The number beside it is how many people will be emailed.',
          },
          {
            title: 'Tick "I confirm send to all … contacts." if you chose All contacts',
            detail: "People who have unsubscribed are left out automatically.",
          },
          {
            title: 'Type the "Subject"',
          },
          {
            title: 'Type or paste the email into "HTML body"',
            detail: "The unsubscribe footer is added for you. Check how it looks in the Preview box underneath.",
          },
          {
            title: 'Click "Review & send to …"',
            detail: "If the check passes, the emails are queued straight away. There is no cancel button after this.",
          },
          {
            title: 'If issues are flagged, click "Edit copy" and fix the wording',
            detail: 'Only tick the box and click "Override and send" if you are sure the wording is fine.',
          },
          {
            title: 'Wait for the "Broadcast queued" message',
            detail: "Real emails start going out to clients within about five minutes.",
          },
        ],
      },
      {
        id: "broadcast-check-history",
        title: "Check how a broadcast went",
        summary: "See how many emails have been sent, are still waiting, or failed.",
        steps: [
          {
            title: 'Scroll down to "Broadcast history"',
            detail: "Each past broadcast shows its subject, date and number of recipients.",
          },
          {
            title: 'Click "Refresh"',
            detail: "New broadcasts start as pending and move to sent over a few minutes.",
          },
          {
            title: "Read the sent, pending and failed counts on the broadcast",
            detail: "The bar fills up as more emails are sent.",
          },
          {
            title: 'Click "why?" beside the failed count to see what went wrong',
            detail: "This link only shows when some emails failed.",
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────── Tasks
  {
    label: "Tasks",
    paths: ["/tasks"],
    about: "Your to-do list: what needs doing, what is overdue and what is finished.",
    guides: [
      {
        id: "tasks-add-task",
        title: "Add a task",
        summary: "Write down something you need to do, with a due date if it has one.",
        steps: [
          {
            title: 'Click "+ Add task"',
            detail: "It is at the top right of the Tasks page.",
          },
          {
            title: 'Type the task in the "What needs doing?" box',
          },
          {
            title: "Pick a due date in the date box",
            detail: "This is optional.",
          },
          {
            title: 'Click "Add"',
            detail: "The task appears in the list.",
          },
        ],
      },
      {
        id: "tasks-complete-and-review",
        title: "Tick off tasks and see what is overdue",
        summary: "Mark work as done and check what is still outstanding.",
        steps: [
          {
            title: "Click the square box beside a task to mark it done",
            detail: "The task gets a tick and a line through it.",
          },
          {
            title: 'Click "Overdue" to see only tasks that are past their due date',
            detail: "The number on each button is how many tasks are in it.",
          },
          {
            title: 'Click "Open" to go back to everything still to do',
            detail: "The most overdue tasks are at the top.",
          },
          {
            title: 'Type in the "Search tasks or contacts…" box to find a task',
          },
          {
            title: "Click a contact's name under a task to open that contact",
          },
          {
            title: 'Click "Completed", then click the ticked box, to reopen a task done by mistake',
          },
        ],
      },
      {
        id: "tasks-delete-task",
        title: "Delete a task",
        summary: "Remove a task that was added by mistake or is no longer needed.",
        steps: [
          {
            title: "Find the task in the list",
            detail: 'Click "All" if you cannot see it.',
          },
          {
            title: 'Click the "✕" at the right end of the task',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "A deleted task cannot be recovered. If the work is simply finished, tick it off instead.",
          },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────── Feedback & issues
  {
    label: "Feedback & issues",
    paths: ["/feedback"],
    about: "Tell the team when something in the CRM is broken, or suggest an improvement.",
    guides: [
      {
        id: "feedback-report-issue",
        title: "Report a problem or suggest an idea",
        summary: "Log a bug or a request in about 30 seconds so it gets looked at.",
        steps: [
          {
            title: 'Click "Feedback & issues" at the top of the sidebar',
            detail: "It is the gold button above the menu groups, on every page.",
          },
          {
            title: 'Choose "Something\'s broken", "Idea / request" or "Other"',
          },
          {
            title: 'Type a few words in "Give it a short title"',
          },
          {
            title: 'Describe it in "Tell us more"',
            detail: "For a problem, say what you did, what happened and what you expected.",
          },
          {
            title: 'Check "Which page?" and choose "How urgent?"',
            detail: "The page you were just on is filled in for you.",
          },
          {
            title: 'Click "Submit feedback"',
            detail: "Your item appears in the list on the right.",
          },
        ],
      },
      {
        id: "feedback-track-progress",
        title: "See what happened to your feedback",
        summary: "Check whether something you reported has been looked at, fixed or needs your approval.",
        steps: [
          {
            title: 'Look at the "Logged so far" list on the right',
          },
          {
            title: 'Click "All" to include finished items, or "Open" for ones still in progress',
          },
          {
            title: "Read the coloured label on the item",
            detail: "It shows where the item is up to, such as Queued, Agent working or Fixed & shipped.",
          },
          {
            title: 'Click "View proposed plan" if a plan has been written',
          },
          {
            title: 'Click "Approve" or "Reject" when the label says "Needs your sign-off"',
            detail: "Approving lets the work go ahead.",
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── Video calls
  {
    label: "Video calls",
    paths: ["/video"],
    about: "Built-in video calls with clients, started from the client's contact page or from a booked meeting.",
    guides: [
      {
        id: "video-start-call",
        title: "Start a video call with a client",
        summary: "Open a call straight away and give the client a link so they can join without logging in.",
        steps: [
          {
            title: 'Click "Contacts" in the sidebar and open the client',
          },
          {
            title: 'Click "Guest link" at the top of their page',
            detail: "The button changes to “Copied”. The client's joining link is now on your clipboard.",
          },
          {
            title: "Paste the link into an email or text message to the client",
            detail: "The CRM does not send it for you.",
          },
          {
            title: 'Click "Video call" at the top of the contact page',
            detail: "The call opens in a new tab. Always join this way yourself, not through the client's link.",
          },
          {
            title: "Allow the camera and microphone if your browser asks",
            detail: "You will see “Connecting to call…” and then the call screen.",
          },
          {
            title: "Leave the call when you are finished",
            detail: "You are taken back to the page you came from.",
          },
        ],
      },
      {
        id: "video-join-booked-meeting",
        title: "Join a booked video meeting",
        summary: "Get into a meeting that is already in the calendar.",
        steps: [
          {
            title: 'Click "Calendar" in the sidebar',
          },
          {
            title: "Click the meeting",
            detail: "Video meetings have a small camera icon beside the title.",
          },
          {
            title: 'Click "Join video meeting"',
            detail: "The call opens in a new tab. The client joins with the link in their invite email.",
          },
          {
            title: "Allow the camera and microphone if your browser asks",
          },
        ],
      },
      {
        id: "video-record-and-review",
        title: "Record a call and watch it later",
        summary: "Keep a recording of a client call and find it again on their contact page.",
        steps: [
          {
            title: 'During the call, click "Record" at the top right',
            detail: "Tell the client first that the call is being recorded.",
          },
          {
            title: 'Click "Recording — Stop" when you want to stop',
            detail: "The button is red while recording is on.",
          },
          {
            title: "After the call, open the client in Contacts",
          },
          {
            title: 'Scroll down the "Overview" tab to "Video calls"',
            detail: "This box only appears once the client has had at least one call.",
          },
          {
            title: 'Click "Recording" beside the call to watch it',
            detail: "It opens in a new tab.",
          },
        ],
      },
    ],
  },
];
