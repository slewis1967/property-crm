import type { HelpSection } from "../types";

/** Help guides for the "Command" group of the sidebar. */
export const commandSections: HelpSection[] = [
  {
    label: "War Room",
    paths: ["/"],
    about:
      "The home page: today's brief from Elvis, the headline numbers, open tasks, the newest leads and contacts, and six quick calculators.",
    guides: [
      {
        id: "war-room-start-your-day",
        title: "Check what needs attention today",
        summary:
          "Read the daily brief and the headline numbers so you know where to start each morning.",
        steps: [
          {
            title: 'Read "Elvis · Today\'s brief"',
            detail: "It is the box at the top of the page and takes a few seconds to load.",
          },
          {
            title: 'Check the four cards: "Total Leads", "Contacts (CRM)", "Stock Pool" and "Hot Leads"',
            detail: "These are live counts.",
          },
          {
            title: 'Click "View hot leads →"',
            detail: 'It is on the "Hot Leads" card and opens Lead Intake showing hot leads.',
          },
          {
            title: 'Come back and read "Open Tasks"',
            detail: "Tasks are listed soonest due first. Overdue ones are shown in red.",
          },
          {
            title: 'Scan "Recent Leads" and "Hot Contacts"',
            detail: 'Click "View all" on either panel to open the full list.',
          },
        ],
      },
      {
        id: "war-room-complete-task",
        title: "Tick off a task",
        summary: "Mark a task as done from the home page once you have finished it.",
        steps: [
          {
            title: 'Scroll to "Open Tasks"',
            detail: "It sits under the four number cards.",
          },
          {
            title: "Find the task and check who it is for and when it is due",
            detail: "The contact name and due date are on the line under the task title.",
          },
          {
            title: "Tick the box to the left of the task",
            detail: "The task is marked complete and leaves the list. You cannot untick it from this page.",
          },
        ],
      },
      {
        id: "war-room-borrowing-capacity",
        title: "Estimate what a client can borrow",
        summary:
          "Use the quick calculator during a call to get a rough maximum loan and purchase price.",
        steps: [
          {
            title: 'Scroll down to "Quick calculators"',
            detail: "They are at the bottom of the page.",
          },
          {
            title: 'Find the "Borrowing capacity" card',
          },
          {
            title: 'Type the client\'s pay into "Your gross annual income"',
            detail: 'Add "Partner gross income (optional)" if there are two incomes.',
          },
          {
            title: 'Type their savings into "Savings / deposit available"',
          },
          {
            title: 'Choose the state under "State (for duty)"',
            detail: 'Tick "First-home buyer (duty concession)" if it applies.',
          },
          {
            title: 'Click "+ Add existing property" for each property they already own',
            detail: "Enter its value, loan balance and weekly rent.",
          },
          {
            title: 'Read "Estimated max loan" and "Max purchase price"',
            detail: "These are estimates only. Nothing on this card is saved when you leave the page.",
          },
        ],
      },
      {
        id: "war-room-stamp-duty",
        title: "Work out stamp duty",
        summary: "Get an indicative stamp duty figure for any state while you are talking to a client.",
        steps: [
          {
            title: 'Scroll down to "Quick calculators"',
          },
          {
            title: 'Find the "Stamp duty by state" card',
          },
          {
            title: 'Type the price into "Purchase price"',
          },
          {
            title: 'Choose the state under "State"',
          },
          {
            title: 'Tick or untick "First-home buyer"',
          },
          {
            title: 'Read "Duty payable"',
            detail: "The figure is indicative. Check it with the state revenue office before a contract.",
          },
        ],
      },
    ],
  },

  {
    label: "Revenue",
    paths: ["/revenue"],
    about:
      "Tracks the commission owed on each deal, what goes to referrers, what has been banked and when the rest is due.",
    guides: [
      {
        id: "revenue-add-deal",
        title: "Add a deal",
        summary: "Record a new deal so its commission and payment dates show in the pipeline.",
        steps: [
          {
            title: 'Click "+ Add deal"',
            detail: "It is at the top right of the page.",
          },
          {
            title: 'Fill in "Lot / address"',
            detail: "This is the only field you must fill in.",
          },
          {
            title: 'Fill in "Supplier" and "Purchaser"',
            detail: "Supplier suggests builders and developers as you type.",
          },
          {
            title: 'Type the amounts into "Remuneration ($)" and "Referrer fee ($)"',
            detail: 'Use "Referrer note" to say who the fee goes to.',
          },
          {
            title: 'Under "Payments", enter a date and an amount for the first payment',
          },
          {
            title: 'Click "+ Add payment" for each further instalment',
            detail: "A warning shows on the deal later if the payments do not add up to the remuneration.",
          },
          {
            title: 'Click "Add deal"',
            detail: "The deal appears at the top of the table.",
          },
        ],
      },
      {
        id: "revenue-mark-payment-paid",
        title: "Mark a payment as received",
        summary: "Record that a commission instalment has landed in the bank.",
        steps: [
          {
            title: 'Type in "Search by supplier, lot or purchaser…" to find the deal',
            detail: "The search box is at the top of the deals table.",
          },
          {
            title: 'Look in the "Payments (click to mark paid)" column',
          },
          {
            title: "Click the payment amount",
            detail: "It turns green with a tick and is saved straight away.",
          },
          {
            title: 'Check the "Banked" and "Outstanding" cards at the top',
            detail: "Both update to reflect the payment.",
          },
          {
            title: "Click the green payment again if you made a mistake",
            detail: "This sets it back to unpaid.",
          },
        ],
      },
      {
        id: "revenue-edit-or-delete-deal",
        title: "Change or remove a deal",
        summary: "Update a deal's figures or stage, or delete one entered by mistake.",
        steps: [
          {
            title: 'Click "Edit" at the right-hand end of the deal\'s row',
          },
          {
            title: "Change the details you need to",
            detail: 'Use "Stage" to move the deal between Active, Settled and Lost.',
          },
          {
            title: 'Click "Save changes"',
            detail: "A deal set to Lost no longer shows in this table or in the totals.",
          },
          {
            title: 'To remove a deal entirely, click "Delete" on its row',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "Deleting cannot be undone.",
          },
        ],
      },
      {
        id: "revenue-forecast-pdf",
        title: "Print a profit forecast",
        summary: "Produce a cash flow and profit forecast you can save as a PDF for a bank or accountant.",
        steps: [
          {
            title: 'Click "Forecast"',
            detail: 'It is at the top right, next to "+ Add deal".',
          },
          {
            title: 'Under "Operating costs", type a cost name and its monthly amount',
            detail: "For example Salaries.",
          },
          {
            title: 'Click "Add"',
            detail: "The cost is saved and the forecast below recalculates. Clicking the cross beside a cost removes it straight away.",
          },
          {
            title: 'Type a name into "Prepared for… (optional)"',
            detail: "It prints in the top right of the document.",
          },
          {
            title: 'Click "Print / Save as PDF"',
          },
          {
            title: "Choose Save as PDF in the print window, then save",
            detail: "Only the forecast document prints, not the costs editor.",
          },
        ],
      },
    ],
  },

  {
    label: "Advisor",
    paths: ["/advisor"],
    about:
      "A weekly list of suggested improvements to the CRM, for you to accept, park or reject.",
    guides: [
      {
        id: "advisor-review-recommendation",
        title: "Review and accept a recommendation",
        summary: "Read what the advisor suggests each week and record that you have acted on it.",
        steps: [
          {
            title: 'Click "Pending"',
            detail: "It is the first button in the row at the top and is selected by default.",
          },
          {
            title: "Click a recommendation to open it",
            detail: "The coloured labels show its impact and whether the senior advisor has approved it.",
          },
          {
            title: 'Read "Why" and "Suggested action"',
          },
          {
            title: 'Click "Mark applied" if you have made the change yourself',
            detail: 'The item moves to "Applied".',
          },
          {
            title: 'If the button says "Apply & run action" or "Auto-Apply", read the confirmation box first',
            detail: "These make the change in the CRM immediately and record it in the audit log.",
          },
          {
            title: 'Click "Applied" in the top row to check it is there',
          },
        ],
      },
      {
        id: "advisor-dismiss-or-snooze",
        title: "Dismiss or snooze a recommendation",
        summary: "Clear suggestions you do not agree with, or put one off until later.",
        steps: [
          {
            title: "Click the recommendation to open it",
          },
          {
            title: 'To reject it, click "Dismiss"',
          },
          {
            title: 'Type why you are dismissing it, then click "OK"',
            detail: "The reason helps the advisor make better suggestions next time.",
          },
          {
            title: 'To put it off instead, click "Snooze"',
          },
          {
            title: 'Type the number of days, then click "OK"',
            detail: "The box suggests 7 days.",
          },
        ],
      },
      {
        id: "advisor-track-in-progress",
        title: "Track a recommendation you are working on",
        summary: "Show that a suggestion is under way, then close it off when the work is finished.",
        steps: [
          {
            title: "Click the recommendation to open it",
          },
          {
            title: 'Click "Start"',
            detail: 'It moves out of "Pending".',
          },
          {
            title: 'Click "In progress" in the top row',
            detail: "Each item shows how many days it has been under way.",
          },
          {
            title: 'Open the item and click "Complete" when the work is done',
            detail: 'It moves to "Applied".',
          },
          {
            title: 'Or click "Back to pending" if you are not going ahead',
            detail: "You are asked to confirm first.",
          },
        ],
      },
    ],
  },

  {
    label: "Brain",
    paths: ["/brain"],
    about:
      "The CRM's long-term memory: facts and lessons the AI features draw on, which you can add to, correct or retire.",
    guides: [
      {
        id: "brain-add-memory",
        title: "Add something for the AI to remember",
        summary: "Record a fact, lesson or playbook so every AI feature in the CRM can use it.",
        steps: [
          {
            title: 'Click "+ New memory"',
            detail: "It is next to the Search button. A form opens underneath.",
          },
          {
            title: "Choose the type from the dropdown on the left of the form",
            detail: "The choices are knowledge, learning and playbook.",
          },
          {
            title: "Type a clear one-line fact in the title box",
          },
          {
            title: 'Type the full explanation in the "Details…" box',
          },
          {
            title: "Add tags, separated by commas",
            detail: "Tags are optional.",
          },
          {
            title: 'Click "Save memory"',
            detail: "The new memory appears in the list.",
          },
        ],
      },
      {
        id: "brain-find-memory",
        title: "Find a memory",
        summary: "Look up what the CRM already knows about a topic, contact or deal.",
        steps: [
          {
            title: "Click a type button at the top",
            detail: "The choices are All, Knowledge, Learnings, Contacts, Deals and Playbooks.",
          },
          {
            title: 'Type a word or phrase in "Search memories…"',
          },
          {
            title: 'Click "Search"',
            detail: "Pressing Enter does the same thing.",
          },
          {
            title: "Read the matching cards",
            detail: "Each one shows where it came from and how many times it has been used.",
          },
        ],
      },
      {
        id: "brain-correct-or-archive-memory",
        title: "Correct, rate or archive a memory",
        summary: "Fix a memory that is wrong, tell the AI how useful it is, or stop it being used.",
        steps: [
          {
            title: 'Click "Edit" on the memory',
          },
          {
            title: "Change the title, the details or the tags",
          },
          {
            title: 'Click "Save"',
          },
          {
            title: "Click the thumbs up if a memory is helpful, or the thumbs down if it is misleading",
            detail: "This raises or lowers its score, which affects how often it is used.",
          },
          {
            title: 'Click "Archive" to stop a memory being used',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "The memory is not deleted, but there is no button on this page to bring it back.",
          },
        ],
      },
    ],
  },

  {
    label: "Smart Search",
    paths: ["/search"],
    about: "Find contacts by describing who you are looking for in plain English.",
    guides: [
      {
        id: "smart-search-find-contacts",
        title: "Find contacts by describing them",
        summary:
          "Type what you are after in your own words and get a ranked list of matching contacts.",
        steps: [
          {
            title: "Type what you are looking for in the search box",
            detail: 'For example "investors not contacted in 30 days".',
          },
          {
            title: "Or click one of the example searches under the box",
            detail: "This only fills in the box. You still need to run the search.",
          },
          {
            title: 'Click "Search"',
            detail: "Pressing Enter does the same thing. It can take a few seconds.",
          },
          {
            title: "Check the small labels above the results",
            detail: "They show how your words were understood, such as the state, buyer type and budget.",
          },
          {
            title: "Read the reason under each name",
            detail: "It explains why that contact matched.",
          },
          {
            title: "Click a name to open the contact",
          },
        ],
      },
    ],
  },

  {
    label: "Analytics",
    paths: ["/analytics"],
    about:
      "A read-only dashboard of lead numbers, new stock coming in, SMS and follow-up activity, and advisor recommendations.",
    guides: [
      {
        id: "analytics-read-lead-numbers",
        title: "See how leads are tracking",
        summary: "Check how many leads you have, how good they are and where they come from.",
        steps: [
          {
            title: 'Look at the "Lead Intelligence" cards at the top',
          },
          {
            title: 'Read "Total Leads" and "Match Rate"',
            detail: "Match Rate is the share of leads that have been matched to a property.",
          },
          {
            title: 'Read "Avg Score" and "Hot Leads"',
            detail: "Warm and cold counts are in small print under the Hot Leads number.",
          },
          {
            title: 'Read "Leads by State" and "Leads by Buyer Type"',
            detail: "Each shows the top five with a share of all leads.",
          },
          {
            title: "Reload the page to refresh the figures",
            detail: "There are no filters, date pickers or export on this page.",
          },
        ],
      },
      {
        id: "analytics-read-stock-and-outreach",
        title: "Check stock, outreach and advisor activity",
        summary:
          "See whether new stock is arriving, how messaging is performing and what the advisor has waiting.",
        steps: [
          {
            title: 'Scroll to "Aggregator Pipeline"',
            detail: "These figures cover the last 7 days.",
          },
          {
            title: 'Check "Pending Review"',
            detail: "An amber number means properties are waiting for someone to check them.",
          },
          {
            title: 'Read the "Recent Ingestion Runs" table',
            detail: 'Look for any run with a status of "failed".',
          },
          {
            title: 'Scroll to "Outreach"',
            detail: "It shows SMS sent, SMS cost and opt-outs, plus how many contacts are in a sequence.",
          },
          {
            title: 'Scroll to "Advisor Activity"',
            detail: '"Pending" is the number of recommendations waiting for you in Advisor.',
          },
        ],
      },
    ],
  },

  {
    label: "Activity Feed",
    paths: ["/activity"],
    about:
      "A read-only log of what Elvis has done: content approved or rejected, and each automated run.",
    guides: [
      {
        id: "activity-feed-check-elvis",
        title: "See what Elvis has been doing",
        summary: "Check recent content decisions and whether the automated runs finished cleanly.",
        steps: [
          {
            title: 'Read the "Content Approvals" list',
            detail: "Each entry shows the decision, the type of content, a short preview and the date.",
          },
          {
            title: "Use the colours to scan the list",
            detail: "Green is approved, red is rejected, yellow is a revision request and orange is a failure.",
          },
          {
            title: 'Read "Pipeline Runs" on the right',
            detail: 'Each run is marked "ok" or "errors".',
          },
          {
            title: "Check the four counts on each run",
            detail: "They are Scraped, Content, Research and Posted.",
          },
          {
            title: 'If you see a yellow "NEXUS API offline" bar, tell your administrator',
            detail: "The page cannot show activity until that service is running again.",
          },
        ],
      },
    ],
  },

  {
    label: "PIA Modeller",
    paths: ["/pia"],
    about:
      "Models an investment property year by year: cash flow, tax, equity and total return over the holding period.",
    guides: [
      {
        id: "pia-model-a-property",
        title: "Model an investment property",
        summary: "Build the numbers for a property so you can talk a client through the likely outcome.",
        steps: [
          {
            title: 'Click "Pick property"',
            detail: "It is in the bar at the top of the page.",
          },
          {
            title: "Search by suburb, street, builder or estate, then click a property",
            detail: "Purchase price, weekly rent and stamp duty are filled in for you.",
          },
          {
            title: 'Check "Purchase price" and "Weekly rent" under "Property"',
            detail: "You can skip picking a property and type these in yourself.",
          },
          {
            title: 'Set "Loan amount" and "Interest rate" under "Finance"',
            detail: "The loan to value ratio and deposit are shown underneath.",
          },
          {
            title: 'Set the client\'s "Marginal tax rate (incl. medicare)" under "Tax & depreciation"',
          },
          {
            title: 'Set "Holding period (years)" under "Horizon"',
          },
          {
            title: "Read the result tiles on the right",
            detail: "They update as you type.",
          },
          {
            title: 'Click "Plain-English summary", "Annual schedule" or "Equity chart"',
            detail: "Each tab shows the same result in a different way.",
          },
        ],
      },
      {
        id: "pia-save-or-print-report",
        title: "Save or print a report",
        summary: "Keep a copy of the scenario in the CRM, or print it for a meeting.",
        steps: [
          {
            title: "Set up the scenario the way you want it",
          },
          {
            title: 'Click "Save report"',
            detail: 'A green "Saved" message appears under the buttons.',
          },
          {
            title: 'Check the "Linked to" line at the top left',
            detail: "A report opened from an opportunity is attached to that opportunity when you save.",
          },
          {
            title: 'Click "Print"',
          },
          {
            title: "Choose your printer or Save as PDF, then print",
            detail: "Only the results print, not the input boxes.",
          },
        ],
      },
      {
        id: "pia-email-report",
        title: "Email a report to a client",
        summary: "Send the analysis straight to a client from the modeller.",
        steps: [
          {
            title: 'Click "Email"',
            detail: "The report is saved first if you have not already saved it.",
          },
          {
            title: "Type the client's email address in the To box",
            detail: "The box starts empty, even when the report is linked to a contact.",
          },
          {
            title: 'Check the "Subject"',
          },
          {
            title: 'Type a note in "Message (optional, shows above the report)"',
          },
          {
            title: 'Click "Send"',
            detail: "The email goes to the client straight away and cannot be recalled.",
          },
        ],
      },
    ],
  },

  {
    label: "Planning Feasibility",
    paths: ["/feasibility"],
    about:
      "Produces a preliminary planning report for any Australian address, covering subdivision, duplex and extra dwelling potential.",
    guides: [
      {
        id: "feasibility-run-assessment",
        title: "Run a planning assessment",
        summary:
          "Find out what could be built or subdivided on a block and get a client-ready report.",
        steps: [
          {
            title: 'Type the address in "Property address"',
          },
          {
            title: 'Describe what the client wants to know in "What do you want to assess?"',
            detail: "Include anything you already know, such as the zone or lot size.",
          },
          {
            title: 'Click "Start assessment"',
          },
          {
            title: "Check the answers already filled in for each question",
            detail: "They are best guesses. Correct or clear any that are wrong.",
          },
          {
            title: 'Click "Continue"',
            detail: "You may be asked a second round of questions.",
          },
          {
            title: 'Or click "Generate report now" to skip any further questions',
          },
          {
            title: "Wait for the report",
            detail: "It can take up to a minute. If you see an error, try again.",
          },
        ],
      },
      {
        id: "feasibility-save-and-export",
        title: "Save a report and export it as a PDF",
        summary: "Keep the finished report in the CRM and produce a PDF to send to the client.",
        steps: [
          {
            title: 'Click "Save to CRM"',
            detail: 'It is in the bar above the report. The button changes to "Saved ✓".',
          },
          {
            title: 'Click "Export PDF"',
          },
          {
            title: "Choose Save as PDF in the print window, then save",
            detail: "Only the report prints, on the NextKey letterhead.",
          },
          {
            title: 'Click "New assessment" to start another',
            detail: "A report you have not saved is lost when you do this.",
          },
        ],
      },
      {
        id: "feasibility-open-saved-report",
        title: "Open or delete a saved report",
        summary: "Go back to a report you saved earlier, or remove one you no longer need.",
        steps: [
          {
            title: 'Scroll to "Saved reports"',
            detail: "It is under the form on the first screen, and only shows once a report has been saved.",
          },
          {
            title: 'Click "Open" beside the report',
          },
          {
            title: 'Click "Export PDF" if you need a copy',
          },
          {
            title: 'To remove a report, click "Delete" beside it',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "Deleting cannot be undone.",
          },
        ],
      },
    ],
  },

  {
    label: "Lender Policy",
    paths: ["/lenders"],
    about:
      "A library of published home loan lending policy for Australian lenders, with the source and date behind every figure.",
    guides: [
      {
        id: "lenders-find-policy",
        title: "Look up a lender's policy",
        summary: "Find what a lender publishes on servicing, loan to value ratio, income and credit.",
        steps: [
          {
            title: 'Type in "Search lenders, policy notes, professions…"',
            detail: "The list updates as you type.",
          },
          {
            title: 'Choose a lender type from "All tiers"',
            detail: "For example Major bank or Non-bank.",
          },
          {
            title: 'Choose from "Any policy data" to show only lenders that hold a certain figure',
            detail: 'For example "Has DTI cap".',
          },
          {
            title: "Click a lender to open it",
            detail: "The bar on each row shows how much of that lender's record is verified.",
          },
          {
            title: 'Read "What this record does not establish"',
            detail: "This lists what is missing for that lender.",
          },
          {
            title: "Read each figure and check its label",
            detail: "The labels are Verified, Broker confirmed, Unverified and Not published.",
          },
          {
            title: "Click the blue source link under a figure",
            detail: "It opens the lender's page in a new tab so you can confirm it.",
          },
        ],
      },
      {
        id: "lenders-confirm-or-correct-figure",
        title: "Confirm or correct a policy figure",
        summary:
          "Record what you have checked against the lender's own policy document so the library stays accurate.",
        steps: [
          {
            title: "Click a lender to open it",
          },
          {
            title: 'Find the figure and click "Confirm / correct"',
            detail: "The link is on the line under the figure.",
          },
          {
            title: "Type the correct value in the first box",
          },
          {
            title: "Choose the date the policy was current",
            detail: 'You cannot click "Confirm" without a date.',
          },
          {
            title: 'Paste the web address into "Source URL (the page you read it on)"',
          },
          {
            title: 'Add a "Note (optional)"',
          },
          {
            title: 'Click "Confirm"',
            detail: 'The figure is now marked "Broker confirmed" and is kept when the research is next refreshed.',
          },
        ],
      },
      {
        id: "lenders-refresh-research",
        title: "Refresh a lender's research",
        summary: "Have the CRM re-read a lender's public policy pages when the record looks out of date.",
        steps: [
          {
            title: "Click a lender to open it",
          },
          {
            title: 'Check the "Researched" date in the grey bar',
          },
          {
            title: 'Click "Re-research from public sources"',
            detail: "It is at the top right. New figures are saved to the record as soon as it finishes.",
          },
          {
            title: "Wait for the blue message",
            detail: "It tells you how many figures were accepted and how many were rejected.",
          },
          {
            title: "Read through the updated figures",
          },
        ],
      },
    ],
  },

  {
    label: "Lender Match",
    paths: ["/lenders/match"],
    about:
      "Scores a client's situation against every lender on file and ranks them, with the reason behind each result.",
    guides: [
      {
        id: "lender-match-run-scenario",
        title: "Match a client to lenders",
        summary: "Enter a client's details and get a ranked shortlist of lenders whose policy they fit.",
        steps: [
          {
            title: 'Choose the "Purpose"',
            detail: 'It is at the top of the "Scenario" panel on the left.',
          },
          {
            title: 'Type the "Loan amount" and "Property value"',
            detail: "Leave Loan amount empty to test the most the client could borrow.",
          },
          {
            title: 'Type "Applicant income", "Partner income", "Dependents" and "Living expenses / mo"',
          },
          {
            title: 'Type the "Deposit" and "Card limits"',
          },
          {
            title: 'Under "Applicant", choose "Employment basis" and "Residency"',
            detail: 'Fill in "Months in role" and "Months in industry" if you know them.',
          },
          {
            title: 'Under "Security", choose the "Property type" and type the "Postcode"',
          },
          {
            title: 'Under "Credit file", type any "Defaults" and the "Genuine savings evidenced"',
            detail: 'Tick "Defaults are paid" if they have been cleared.',
          },
          {
            title: 'Click "Match lenders"',
            detail: "The ranked list appears on the right. Nothing is saved or sent.",
          },
        ],
      },
      {
        id: "lender-match-read-results",
        title: "Read the lender shortlist",
        summary: "Understand why each lender fits, needs an exception or is ruled out.",
        steps: [
          {
            title: "Read the four totals above the list",
            detail: "They count lenders that fit policy, need an exception, lack policy data, or are ruled out.",
          },
          {
            title: "Read the label and the estimated maximum loan on each lender",
            detail: "The small text under the amount says what is limiting it.",
          },
          {
            title: "Click a lender to see every check",
            detail: "A tick is a pass, a cross is a fail, an exclamation mark needs an exception and a question mark could not be checked.",
          },
          {
            title: 'Click "source" beside a check',
            detail: "It opens the lender's published policy in a new tab.",
          },
          {
            title: 'Click "Full policy record →"',
            detail: "It opens that lender in Lender Policy.",
          },
          {
            title: "Confirm the result with the lender before you act on it",
            detail: "This shortlist is an internal research aid. It is not credit advice and is not for the client.",
          },
        ],
      },
    ],
  },
];
