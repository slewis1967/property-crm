import type { HelpSection } from "../types";

/**
 * Help content for the sidebar groups "System", "Elvis" and "Archive", plus
 * the voice assistant (the floating microphone button shown on every page).
 *
 * Every button, tab and field named here is copied from the page it lives on.
 * If a label changes in the UI, change it here too.
 */
export const systemSections: HelpSection[] = [
  {
    label: "Paid Accounts",
    paths: ["/paid-services"],
    about:
      "A list of every paid service the business runs on, what each one costs, when it renews, and which ones need attention today.",
    guides: [
      {
        id: "paid-services-mark-paid",
        title: "Deal with an account that needs attention",
        summary:
          "Use this when an account shows as \"Action now\" or \"Coming up\" and you have paid it, or want to be reminded later.",
        steps: [
          {
            title: 'Open "Paid Accounts" in the sidebar',
            detail: 'It is under the "System" group.',
          },
          {
            title: "Read the list under the \"need attention\" heading",
            detail: "Each coloured box is one account, with the reason it was flagged.",
          },
          {
            title: 'Click "Open billing ↗" to pay the bill',
            detail:
              "This opens the supplier's billing page in a new tab. The button only shows if a billing page has been saved for that account.",
          },
          {
            title: 'Click "Mark paid"',
            detail:
              "This records today as the payment date and moves the next due date forward by one billing cycle. It does not pay anything for you.",
          },
          {
            title: 'Or click "Snooze 7d" if you are already dealing with it',
            detail: "The account is hidden from the attention list and the daily email for a week.",
          },
        ],
      },
      {
        id: "paid-services-add-account",
        title: "Add a new paid account",
        summary: "Use this when the business signs up to a new paid service, so its cost and renewal date are tracked.",
        steps: [
          {
            title: 'Click "+ Add account"',
            detail: "It is at the top right of the page.",
          },
          {
            title: 'Type the name in "Service name"',
            detail: "This is the only field you must fill in.",
          },
          {
            title: 'Fill in "Cost" and choose a "Billing cycle"',
            detail: "Enter the cost for one billing cycle, for example one month.",
          },
          {
            title: 'Pick the "Next due date"',
            detail: "The reminders count down to this date.",
          },
          {
            title: 'Type a label in "Pays with"',
            detail: 'Use a label such as "Amex ••1234". Never type a full card number or a password.',
          },
          {
            title: 'Paste the supplier\'s billing page into "Billing page URL"',
            detail: "This gives you a one click link to the billing page later.",
          },
          {
            title: 'Click "Save"',
            detail: 'To see the new account, scroll down to the register and click "All".',
          },
        ],
      },
      {
        id: "paid-services-edit-account",
        title: "Update or remove an account",
        summary: "Use this when a price, renewal date or card changes, or when a service is no longer used.",
        steps: [
          {
            title: 'Scroll down to "The register"',
            detail: "It is the table in the lower half of the page.",
          },
          {
            title: 'Click "All"',
            detail: 'The table starts on "Flagged", which only shows accounts with something to fix.',
          },
          {
            title: 'Click "edit" on the account\'s row',
            detail: "It is at the right hand end of the row. The form opens under it.",
          },
          {
            title: "Change the fields you need",
            detail: 'For example "Cost", "Next due date" or "Card expires".',
          },
          {
            title: 'Click "Save"',
          },
          {
            title: 'To take an account off the list, click "remove"',
            detail:
              "You are asked to confirm. This only removes it from this list and cannot be undone. It does not cancel the service with the supplier.",
          },
        ],
      },
      {
        id: "paid-services-send-digest",
        title: "Refresh balances and send the digest email",
        summary:
          "Use this to get up to date prepaid balances, or to send the attention list by email now without waiting for the daily check.",
        steps: [
          {
            title: 'Find the "Daily check" bar',
            detail: "It sits under the four summary tiles and shows when the automatic check last ran.",
          },
          {
            title: 'Click "Refresh balances"',
            detail: "This reads the current prepaid balances. A green message shows what was read.",
          },
          {
            title: 'Click "Send digest now"',
            detail: "A box asks you to confirm, and names the address the email will go to.",
          },
          {
            title: 'Click "OK" to send',
            detail:
              "This sends a real email straight away and cannot be undone. If nothing needs attention, no email is sent and the message tells you so.",
          },
        ],
      },
    ],
  },

  {
    label: "Settings",
    paths: ["/settings"],
    about:
      "Settings that apply across the whole CRM: email signatures, the brokers a Fact Find can be sent to, property types, and extra instructions for the voice assistant.",
    guides: [
      {
        id: "settings-edit-signature",
        title: "Change your email signature",
        summary: "Use this to update the name, title, contact details or logo that are added to the bottom of the emails you send.",
        steps: [
          {
            title: 'Open "Settings" in the sidebar',
            detail: 'It is under the "System" group.',
          },
          {
            title: 'Scroll to "Email signature"',
          },
          {
            title: 'Click your name next to "Editing signature for"',
            detail: "Each person has their own signature. Check your name is the one highlighted.",
          },
          {
            title: 'Update "Name", "Title", "Email", "Phone" and "Web"',
            detail: 'The "Preview" on the right changes as you type.',
          },
          {
            title: 'Click "+ Upload logo" to add a logo',
            detail: 'If a logo is already there, use "Replace" or "Remove" instead.',
          },
          {
            title: 'Click "Save signature"',
            detail: "A green message confirms it. The new signature is used on every email sent from then on.",
          },
        ],
      },
      {
        id: "settings-add-broker",
        title: "Add a broker",
        summary: "Use this so a new broker can be chosen from the list when you submit a completed Fact Find.",
        steps: [
          {
            title: 'Scroll to "Brokers"',
          },
          {
            title: 'Type the broker\'s name in the empty "Broker name" box',
            detail: "Use the row with the dashed border, under the existing brokers.",
          },
          {
            title: 'Type their email in the "email@broker.com" box',
            detail: "A name and a valid email are both needed.",
          },
          {
            title: 'Fill in "Company (optional)" and "Ref / comp code" if you have them',
          },
          {
            title: 'Click "Add broker"',
            detail: 'It saves straight away and "✓ Saved" appears underneath.',
          },
          {
            title: 'Untick "Active" to switch a broker off, or click "Remove" to delete one',
            detail: "Both save straight away. Remove asks you to confirm first.",
          },
        ],
      },
      {
        id: "settings-add-property-type",
        title: "Add a property type",
        summary: "Use this to add a new category of property, so stock can be sorted and filtered by it.",
        steps: [
          {
            title: 'Scroll to "Property types"',
            detail: "It is the last section on the page.",
          },
          {
            title: 'Type the name in the "New type name" box',
            detail: "Use the row with the dashed border at the bottom of the list.",
          },
          {
            title: "Add a short description in the box beside it",
            detail: "This is optional. It helps new stock get sorted into the right type.",
          },
          {
            title: 'Click "+ Add"',
            detail: 'It saves straight away and "✓ Saved" appears at the top of the list.',
          },
          {
            title: 'To delete a type, click the "✕" at the end of its row',
            detail: "You are asked to confirm.",
          },
        ],
      },
      {
        id: "settings-ai-instructions",
        title: "Give the voice assistant extra instructions",
        summary: "Use this to steer how the voice assistant talks and what it assumes, such as tone or preferred callback times.",
        steps: [
          {
            title: 'Find "AI instructions" at the top of the page',
          },
          {
            title: "Type your instructions in the large text box",
            detail: "Write them as plain sentences or dot points. The counter underneath shows how much room is left.",
          },
          {
            title: 'Click "Save instructions"',
            detail: '"Saved" appears beside the button. The assistant follows them from its next reply.',
          },
          {
            title: 'To remove them, clear the box and click "Save instructions" again',
            detail: "The assistant still asks before it sends any SMS or email. These instructions cannot change that.",
          },
        ],
      },
    ],
  },

  {
    label: "Approval Queue",
    paths: ["/approvals"],
    about:
      "Shows the content Elvis has prepared that is waiting for a yes or no, and a history of what has been approved or rejected.",
    guides: [
      {
        id: "approvals-check-pending",
        title: "See what is waiting for approval",
        summary: "Use this to read the content that is waiting before you approve or reject it in Telegram.",
        steps: [
          {
            title: 'Open "Approval Queue" in the sidebar',
            detail: 'It is under the "Elvis" group.',
          },
          {
            title: 'Look at the "Pending Approval" box',
            detail: 'Each orange card is one item marked "Awaiting". The number waiting is shown at the top right of the page.',
          },
          {
            title: "Read the text on the card",
            detail: "It shows the type of content and the start of the wording.",
          },
          {
            title: "Open Telegram and tap ✅, ❌ or ✏️ on the matching message",
            detail:
              "There are no approve buttons on this page. Approving in Telegram can publish the content, so read it first.",
          },
          {
            title: "Refresh the page",
            detail: 'Once every item is dealt with, the box shows "Queue is clear".',
          },
        ],
      },
      {
        id: "approvals-review-history",
        title: "Check what was approved or rejected",
        summary: "Use this to confirm a decision went through, or to see what happened to an earlier item.",
        steps: [
          {
            title: 'Scroll down to "Approval History"',
          },
          {
            title: "Read down the list",
            detail: "The newest decision is at the top. The list holds the last 50.",
          },
          {
            title: "Check the colour and wording of each row",
            detail: 'Green is "Approved", red is "Rejected" and yellow is "Revision requested".',
          },
          {
            title: "Check the date and time on the right of the row",
            detail: "This is when the decision was made in Telegram.",
          },
        ],
      },
    ],
  },

  {
    label: "Social History",
    paths: ["/social"],
    about: "A record of the Facebook and Instagram posts Elvis has published, what is scheduled next, and how the posts performed.",
    guides: [
      {
        id: "social-check-posts",
        title: "Check what has been posted",
        summary: "Use this to confirm a post went out, or to see whether one is still waiting for approval.",
        steps: [
          {
            title: 'Open "Social History" in the sidebar',
            detail: 'It is under the "Elvis" group.',
          },
          {
            title: "Read the tiles at the top",
            detail: '"FB Posts" is the number published. "Last Post" is when the most recent one went out.',
          },
          {
            title: 'Scroll to "Recent Facebook listings"',
          },
          {
            title: 'Check the label in the "Post ID / Status" column',
            detail: '"Posted" means it is live. "Pending approval" means it is waiting in Telegram. "Expired" means it was never approved.',
          },
          {
            title: 'Scroll to "Combined platform log" to see Facebook and Instagram together',
            detail: 'A tick means the post worked. A cross means it failed, and the reason is in "Notes". This table only shows when there is something to list.',
          },
        ],
      },
      {
        id: "social-check-scheduled",
        title: "See what is scheduled to post next",
        summary: "Use this to see which posts are lined up and when they will go out.",
        steps: [
          {
            title: 'Check the "Scheduled" tile at the top',
            detail: "It shows how many posts are waiting to go out.",
          },
          {
            title: 'Scroll to "Upcoming scheduled"',
          },
          {
            title: 'Read "Scheduled for", "Platform" and "Preview"',
            detail: "These show when each post goes out, where it goes, and the start of its wording.",
          },
          {
            title: 'Scroll to "Approval activity" to see recent decisions',
            detail: "This page is for viewing only. Posts cannot be edited or cancelled from here.",
          },
        ],
      },
    ],
  },

  {
    label: "Sequences",
    paths: ["/sequences"],
    about:
      "Shows the automatic email and SMS follow up series, who is in each one, what is due to send next, and what has just been sent.",
    guides: [
      {
        id: "sequences-check-sequence",
        title: "See how a sequence is going",
        summary: "Use this to check how many people are in a follow up series and whether any sends have failed.",
        steps: [
          {
            title: 'Open "Sequences" in the sidebar',
            detail: 'It is under the "Elvis" group. The page heading reads "Outbound Sequences".',
          },
          {
            title: 'Find the sequence under "Registered sequences"',
            detail: "Each card is one series. The label at the top right shows if it sends email, SMS or both.",
          },
          {
            title: 'Read the "Active", "Paused", "Done" and "Failed" numbers',
            detail: "These count the people at each stage. A red number under Failed means something needs looking at.",
          },
          {
            title: "Check the bottom of the card",
            detail: 'It shows "active" if the series is switched on, or "inactive" if it is off.',
          },
        ],
      },
      {
        id: "sequences-check-due-and-sent",
        title: "See what is due to send and what was sent",
        summary: "Use this to find out when a contact will get their next message, or whether a message actually went out.",
        steps: [
          {
            title: 'Scroll to "Next 20 due steps"',
            detail: "This lists who gets a message next and when. It only shows when something is due.",
          },
          {
            title: "Click a contact's name",
            detail: "This opens their contact record.",
          },
          {
            title: 'Go back and scroll to "Recent step activity"',
            detail: "This lists the last 30 messages the system tried to send.",
          },
          {
            title: 'Check the "Status" column',
            detail: '"sent" means it went out. "failed" shows the reason in red underneath. "skipped" means it was held back.',
          },
          {
            title: "Ask for changes if someone needs to be added, paused or removed",
            detail: "This page is for viewing only. People cannot be added to or taken out of a sequence from here.",
          },
        ],
      },
    ],
  },

  {
    label: "Conversations",
    paths: ["/conversations"],
    about: "A view only record of old email and SMS conversations kept from the previous CRM.",
    guides: [
      {
        id: "conversations-find-old-message",
        title: "Find an old conversation",
        summary: "Use this to look up what was last said to a contact in the previous CRM.",
        steps: [
          {
            title: 'Open "Conversations" in the sidebar',
            detail: 'It is under the "Archive" group.',
          },
          {
            title: 'Click the "Search last message body…" box',
          },
          {
            title: "Type a word from the message and press Enter",
            detail: "The search looks at the wording of the last message only, not the contact's name.",
          },
          {
            title: 'Read the "Last message" and "When" columns',
            detail: 'The "Type" column shows whether it was an email, an SMS or a call.',
          },
          {
            title: "Click the contact's name",
            detail: "This opens their contact record.",
          },
          {
            title: 'Click "Next →" at the bottom for more results',
            detail: "Nothing on this page can be edited, and no messages can be sent from it.",
          },
        ],
      },
    ],
  },

  {
    label: "Notes",
    paths: ["/notes"],
    about: "A view only record of the notes written against contacts in the previous CRM.",
    guides: [
      {
        id: "notes-find-old-note",
        title: "Find an old note",
        summary: "Use this to look up something that was written about a contact in the previous CRM.",
        steps: [
          {
            title: 'Open "Notes" in the sidebar',
            detail: 'It is under the "Archive" group.',
          },
          {
            title: 'Click the "Search note body…" box',
          },
          {
            title: "Type a word from the note and press Enter",
            detail: "The search looks at the wording of the note, not the contact's name.",
          },
          {
            title: "Read the note cards",
            detail: "One card can hold several entries. Each entry shows its date and who wrote it, where that was recorded.",
          },
          {
            title: "Click the contact's name at the top of a card",
            detail: "This opens their contact record. Write any new note there, not on this page.",
          },
          {
            title: 'Click "Next →" at the bottom for more results',
          },
        ],
      },
    ],
  },

  {
    label: "Tasks (archive)",
    paths: ["/tasks/archive"],
    about: "A view only record of the tasks logged against contacts in the previous CRM.",
    guides: [
      {
        id: "tasks-archive-find-old-task",
        title: "Find an old task",
        summary: "Use this to check what was planned or finished for a contact in the previous CRM.",
        steps: [
          {
            title: 'Open "Tasks" under the "Archive" group in the sidebar',
            detail: 'There are two "Tasks" links. The one under "Archive" is the old record. The one under "CRM" is for current tasks.',
          },
          {
            title: 'Click "Open" or "Completed"',
            detail: 'These buttons narrow the list. Click "All" to see every task again.',
          },
          {
            title: 'Or type a word in the "Search title or body…" box and press Enter',
            detail: "Searching shows all matching tasks, both open and completed.",
          },
          {
            title: 'Read the "Due" and "Status" columns',
            detail: 'Status shows "✓ done" or "open".',
          },
          {
            title: "Click the contact's name",
            detail: "This opens their contact record. Old tasks cannot be changed or ticked off here.",
          },
        ],
      },
    ],
  },

  {
    label: "Media Library",
    paths: ["/media"],
    about: "A view only list of the files that were uploaded to the previous CRM, such as contracts, ID documents and marketing material.",
    guides: [
      {
        id: "media-find-file",
        title: "Find an old file",
        summary: "Use this to check whether a file from the previous CRM was saved, and what it was called.",
        steps: [
          {
            title: 'Open "Media Library" in the sidebar',
            detail: 'It is under the "Archive" group.',
          },
          {
            title: 'Click the "Search filename…" box',
          },
          {
            title: "Type part of the file name and press Enter",
          },
          {
            title: 'Check the "Status" column',
            detail: '"ok" means the file was saved. "failed" means it could not be saved. "skipped" means only its details were kept.',
          },
          {
            title: 'Note the "Name" and "Local path" of the file you need',
            detail: "Files cannot be opened or downloaded from this page. Pass these details on to have the file fetched for you.",
          },
        ],
      },
      {
        id: "media-check-saved-files",
        title: "See which files failed to save",
        summary: "Use this to see how many old files were saved and which ones were missed.",
        steps: [
          {
            title: "Read the four tiles at the top",
            detail: 'They show "Downloaded OK", "Failed", "Skipped (metadata-only)" and "Total size on disk".',
          },
          {
            title: 'Click "failed"',
            detail: "It is in the row of buttons under the tiles. The list now shows only the files that did not save.",
          },
          {
            title: "Read the red text under the status",
            detail: "This is the reason the file could not be saved.",
          },
          {
            title: 'Click "All" to go back to the full list',
          },
        ],
      },
    ],
  },

  {
    label: "Voice assistant",
    paths: [],
    about:
      "The round microphone button at the bottom right of every page lets you talk to the CRM to find contacts, log calls, set reminders and draft messages.",
    guides: [
      {
        id: "voice-assistant-ask",
        title: "Ask the voice assistant something",
        summary: "Use this to find a contact by speaking instead of typing.",
        steps: [
          {
            title: "Click the round microphone button",
            detail: "It is at the bottom right of every page. It does not show in browsers that cannot listen, such as Firefox.",
          },
          {
            title: "Press and hold the large microphone button in the panel",
            detail: 'You can hold the spacebar instead. The panel shows "Listening…" and the button turns red.',
          },
          {
            title: 'Say what you want, for example "Find Justino"',
            detail: "Your words appear in the panel as you speak. Allow the microphone if your browser asks.",
          },
          {
            title: "Let go of the button",
            detail: 'The panel shows "Thinking…". The answer is then read out loud and shown in the panel.',
          },
          {
            title: "Hold the button again to reply or ask something else",
            detail: "The assistant remembers the conversation so far.",
          },
          {
            title: 'Click "×" to close the panel',
            detail: "This also stops it speaking.",
          },
        ],
      },
      {
        id: "voice-assistant-log-call-or-reminder",
        title: "Log a call or set a reminder by voice",
        summary: "Use this straight after a phone call to save a note or a follow up without typing.",
        steps: [
          {
            title: "Click the round microphone button",
            detail: "It is at the bottom right of the page.",
          },
          {
            title: "Press and hold the large microphone button",
          },
          {
            title: "Say who the call was with and what was said",
            detail: 'For a reminder, say something like "Remind me to follow up with Hamish on Friday".',
          },
          {
            title: "Let go of the button and listen to the reply",
            detail: "If the assistant asks a question, hold the button again to answer it.",
          },
          {
            title: "Check the small tick line under the reply",
            detail: 'It reads "Note logged on" with the contact\'s name, or "Task:" with the reminder and its due date.',
          },
        ],
      },
      {
        id: "voice-assistant-send-message",
        title: "Send an SMS or email by voice",
        summary: "Use this to have the assistant write a message to a contact and send it once you agree.",
        steps: [
          {
            title: "Click the round microphone button",
          },
          {
            title: "Press and hold the large microphone button",
          },
          {
            title: "Say who the message is for and what it should say",
          },
          {
            title: "Let go and listen to the draft",
            detail: 'The assistant reads the message back. The tick line reads "SMS drafted" or "Email drafted", awaiting confirmation. Nothing has been sent yet.',
          },
          {
            title: "Hold the button and say what to change, if anything",
          },
          {
            title: "Hold the button and say yes to send it",
            detail:
              'This sends a real SMS or email to the contact and cannot be undone. The tick line then reads "SMS sent" or "Email sent".',
          },
        ],
      },
      {
        id: "voice-assistant-start-over",
        title: "Start a fresh conversation",
        summary: "Use this when the assistant has the wrong idea, or you are moving on to a different contact.",
        steps: [
          {
            title: "Open the voice assistant panel",
            detail: "Click the round microphone button at the bottom right of the page.",
          },
          {
            title: 'Click "Reset"',
            detail: "It is at the top right of the panel. This clears the conversation and stops it speaking.",
          },
          {
            title: "Press and hold the large microphone button and start again",
            detail: "Notes, tasks and messages already saved or sent are not undone by Reset.",
          },
        ],
      },
    ],
  },
];
