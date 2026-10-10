import type { HelpSection } from "../types";

export const crmASections: HelpSection[] = [
  {
    label: "Opportunities",
    paths: ["/opportunities"],
    about:
      "The working pipeline board, where every active buyer sits in a column for the stage they are up to.",
    guides: [
      {
        id: "opportunities-add-new",
        title: "Add a new opportunity",
        summary:
          "Put a new buyer on the board so the team can start working with them.",
        steps: [
          {
            title: 'Click "New Opportunity"',
            detail: "The blue button at the top right of the board.",
          },
          {
            title: 'Search for the person under "Primary Contact"',
            detail:
              "Type a name, email or phone and pick them from the list. Their details fill in for you.",
          },
          {
            title: 'Or type their "Full Name" and "Email" yourself',
            detail: "Both are required. A new contact is created for them when you save.",
          },
          {
            title: 'Choose the "Buyer Type", "State", "Budget" and "Timeframe"',
          },
          {
            title: 'Fill in "Preferred buy location"',
            detail: "This is required for an Owner Occupier or First Home Buyer.",
          },
          {
            title: 'Pick the "Pipeline" and "Pipeline Stage"',
            detail: "This decides which column the new card lands in.",
          },
          {
            title: 'Click "Create Opportunity"',
            detail: "The new card appears on the board.",
          },
        ],
      },
      {
        id: "opportunities-move-stage",
        title: "Move an opportunity to another stage",
        summary:
          "Update where a buyer is up to, so the board always shows the true picture.",
        steps: [
          {
            title: "Click the pipeline name at the top of the board",
            detail: "Each pipeline has its own tab with a count beside it.",
          },
          {
            title: "Drag the card into the new column",
            detail: 'The card shows "Saving…" for a moment, then stays in its new stage.',
          },
          {
            title: "Or click the card to open it",
          },
          {
            title: 'Click the new stage under "Stage"',
            detail: 'It is in the "Pipeline" box. "✓ Saved" shows when it is done.',
          },
        ],
      },
      {
        id: "opportunities-schedule-meeting",
        title: "Schedule a meeting with a buyer",
        summary:
          "Book a video meeting from the opportunity and email the buyer an invite.",
        steps: [
          {
            title: "Click the buyer's card on the board",
            detail: "This opens the opportunity.",
          },
          {
            title: 'Click "Schedule meeting"',
            detail: "It is in the row of buttons at the top.",
          },
          {
            title: 'Choose the "Meeting host", "Date", "Start" and "Duration"',
          },
          {
            title: 'Check the "Attendee email"',
            detail: "This is where the invite goes.",
          },
          {
            title: 'Leave "Send invite email to attendee" ticked',
            detail:
              "The buyer is emailed an invite with a video link. Untick it if you do not want an email sent.",
          },
          {
            title: 'Click "Schedule meeting"',
            detail: "A message tells you whether the invite was emailed.",
          },
          {
            title: 'Click "Close"',
          },
        ],
      },
      {
        id: "opportunities-hide-or-delete",
        title: "Hide or delete opportunities",
        summary:
          "Clear leads that do not qualify off the board, or delete records made by mistake.",
        steps: [
          {
            title: "Hover over a card and tick the small box at its top left",
            detail: "Tick as many cards as you need. A blue bar appears at the top.",
          },
          {
            title: 'Click "Mark DNQ" to hide them',
            detail:
              "DNQ means Do Not Qualify. The cards are hidden from the board but not deleted.",
          },
          {
            title: 'To bring one back, click "DNQ" in the toolbar',
            detail: 'Tick the card, then click "Restore".',
          },
          {
            title: 'To remove them for good, click "Delete" in the blue bar',
          },
          {
            title: 'Fill in "Reason for deletion" and "Your name"',
            detail: "Both are required and are kept on record.",
          },
          {
            title: 'Click "Delete"',
            detail: "This permanently deletes the opportunity and cannot be undone.",
          },
        ],
      },
    ],
  },
  {
    label: "Deal Analyser",
    paths: ["/deal-analyser"],
    about:
      "Turns a builder's property package into investment reports and a comparison you can send to a client.",
    guides: [
      {
        id: "deal-analyser-generate-reports",
        title: "Generate the reports for a deal packet",
        summary:
          "Fill in the missing rent and build the investment report for each property, plus the comparison.",
        steps: [
          {
            title: "Click a deal packet in the list",
            detail: 'Ones marked "Needs rent" are waiting on you.',
          },
          {
            title: 'Type the rent into "Weekly rent" for each property',
            detail:
              'The box may already show an estimate. Type over it with the real figure. For a co-living property the box is called "Rent per room".',
          },
          {
            title: 'Click "Research" on a property',
            detail:
              "This looks up the interest rate, stamp duty, council rates and insurance for you.",
          },
          {
            title: "Check the other figures and change any that are wrong",
            detail: 'Click "Advanced (growth, depreciation, fees…)" to see more.',
          },
          {
            title: 'Click "Generate reports"',
            detail:
              'If reports already exist the button says "Save changes & regenerate".',
          },
          {
            title: 'Click "View →" beside a report under "Current reports"',
          },
        ],
      },
      {
        id: "deal-analyser-attach-opportunity",
        title: "Attach a deal packet to a client",
        summary:
          "Link the packet to the client's opportunity so the reports sit with their record.",
        steps: [
          {
            title: "Click a deal packet in the list",
          },
          {
            title: 'Click "+ Attach to an opportunity"',
            detail: 'It is under "Opportunity" at the top of the page.',
          },
          {
            title: "Type the client's name or email in the search box",
          },
          {
            title: "Click the right client in the list",
            detail: 'The page shows "Attached" when it is saved.',
          },
          {
            title: 'To undo it, click "Detach"',
          },
        ],
      },
      {
        id: "deal-analyser-email-report",
        title: "Email a report to a client",
        summary: "Send a finished report straight to the client, or save it as a PDF.",
        steps: [
          {
            title: "Click a deal packet in the list",
          },
          {
            title: 'Click "View →" beside the report you want',
            detail: 'Reports are listed under "Current reports".',
          },
          {
            title: 'Click "Email"',
            detail: "It is in the toolbar at the top of the report.",
          },
          {
            title: "Type the client's email address, and change the subject if you want",
          },
          {
            title: "Add a short message",
            detail: "This is optional. Your email signature is added automatically.",
          },
          {
            title: 'Click "Send"',
            detail: "This emails the report to the client straight away.",
          },
          {
            title: 'Or click "Export PDF" to save a copy',
            detail: 'Choose "Save as PDF" in the print window that opens.',
          },
        ],
      },
      {
        id: "deal-analyser-add-property",
        title: "Add a property to a deal packet",
        summary: "Include another property so it is compared with the rest.",
        steps: [
          {
            title: "Click a deal packet in the list",
          },
          {
            title: 'Click "+ Add a property"',
            detail: "It is below the last property card.",
          },
          {
            title: 'Click "From stock" to pick one of our listed properties',
            detail: "Search by suburb, address or builder, then click the property.",
          },
          {
            title: 'Or stay on "Manual entry" and fill in the boxes',
            detail: 'Then click "Add property".',
          },
          {
            title: "Type a rent into the new property's card",
          },
          {
            title: 'Click "Save changes & regenerate"',
            detail: "The reports are rebuilt with the new property included.",
          },
        ],
      },
    ],
  },
  {
    label: "Lead Intake",
    paths: ["/leads"],
    about:
      "The inbox of new enquiries, where you decide which leads go into the working pipeline.",
    guides: [
      {
        id: "leads-promote-to-pipeline",
        title: "Promote a lead into the pipeline",
        summary:
          "Move a new enquiry onto the Opportunities board so the team starts working it.",
        steps: [
          {
            title: 'Click "To triage"',
            detail: "This shows only the leads nobody has promoted yet.",
          },
          {
            title: "Read the lead's details across the row",
            detail: "Score, Match and Top Match show how the lead was rated.",
          },
          {
            title: 'Choose a pipeline beside "Promote into:"',
            detail: "The lead goes into the first stage of that pipeline.",
          },
          {
            title: 'Click "→ Promote" at the end of the row',
            detail: "A green message confirms it. The lead leaves the To triage list.",
          },
          {
            title: 'Click "Working pipeline →" to see it on the board',
          },
        ],
      },
      {
        id: "leads-review-all",
        title: "See every lead and what has been promoted",
        summary: "Check the full list of enquiries, including ones already in the pipeline.",
        steps: [
          {
            title: "Look at the three boxes at the top",
            detail: '"To triage", "Matched" and "Promoted" show the current counts.',
          },
          {
            title: 'Click "All leads"',
            detail: "The table now includes leads that were already promoted.",
          },
          {
            title: 'Look for "✓ In pipeline" at the end of a row',
            detail: "That lead has already been promoted.",
          },
          {
            title: 'Click "✓ In pipeline" to go to the Opportunities board',
          },
        ],
      },
    ],
  },
  {
    label: "Introducers",
    paths: ["/admin/introducers"],
    about:
      "Manages the outside firms who refer clients to us, and the referrals they send in.",
    guides: [
      {
        id: "introducers-review-referral",
        title: "Review and decide on a referral",
        summary:
          "Check a referral an introducer has sent and accept or decline it.",
        steps: [
          {
            title: 'Click "Review queue"',
            detail: 'Referrals waiting on us are listed under "With us".',
          },
          {
            title: "Click the referral you want to review",
          },
          {
            title: "Read through the client's details",
          },
          {
            title: 'Type a note in "Message to the introducer" under "Decision"',
            detail: "This is optional.",
          },
          {
            title: 'Click "Accept — create the opportunity"',
            detail:
              "This creates the client's opportunity in the pipeline. Only the business owner can do this.",
          },
          {
            title: 'Or type a reason and click "Decline"',
            detail: "A reason is required to decline.",
          },
        ],
      },
      {
        id: "introducers-ask-for-more",
        title: "Ask an introducer for more information",
        summary:
          "Request missing details or documents on a referral before you decide on it.",
        steps: [
          {
            title: 'Click "Review queue", then click the referral',
          },
          {
            title: 'Find the "Ask for more" box',
          },
          {
            title: 'Type what you need in "What do you need, and why?"',
          },
          {
            title: 'Click "Missing details to request" and tick the items you need',
            detail: "Only details that are still blank are listed.",
          },
          {
            title: 'List any paperwork under "Documents (one per line)"',
          },
          {
            title: 'Click "Request from introducer"',
            detail:
              "Only the items you asked for are opened for the introducer to fill in.",
          },
        ],
      },
      {
        id: "introducers-start-accreditation",
        title: "Start accrediting a new introducer",
        summary:
          "Invite a new introducer to begin the accreditation steps before they can refer clients.",
        steps: [
          {
            title: 'Click "Introducer firms"',
          },
          {
            title: 'Click "Start an accreditation"',
            detail: "Only the business owner sees this button.",
          },
          {
            title: 'Type their "Full legal name" and "Email"',
            detail:
              "The legal name is printed on their certificate and agreement. They cannot change it.",
          },
          {
            title: 'Choose the "Tier" and "Commercial terms"',
            detail: "Get these right now. They decide which documents are issued.",
          },
          {
            title: 'Click "Send and start"',
            detail: "This emails the introducer their first step straight away.",
          },
          {
            title: 'Click "Accreditations" to follow their progress',
          },
        ],
      },
      {
        id: "introducers-suspend-firm",
        title: "Suspend or reactivate an introducer",
        summary: "Switch off a firm or one of its logins, or switch it back on.",
        steps: [
          {
            title: 'Click "Introducer firms"',
          },
          {
            title: "Find the firm in the list",
          },
          {
            title: 'Click "Suspend" on the right of the firm',
            detail: "Only the business owner sees this button.",
          },
          {
            title: 'To suspend one person only, click "Suspend" beside their email',
          },
          {
            title: 'Click "Reactivate" to switch a firm or person back on',
          },
        ],
      },
    ],
  },
  {
    label: "Partners",
    paths: ["/admin/partners"],
    about:
      "Manages the channel partners who sell our stock, and the holds and deals they request.",
    guides: [
      {
        id: "partners-grant-hold",
        title: "Grant or decline a hold request",
        summary:
          "Respond when a partner asks to hold a lot for their client.",
        steps: [
          {
            title: 'Click "Hold requests & deals"',
          },
          {
            title: 'Choose "Requests only" beside "Show"',
            detail: "This lists only the requests waiting for an answer.",
          },
          {
            title: 'Click "Grant hold" on the request',
          },
          {
            title: 'Set the "Hold until" date',
            detail: "Confirm the date with the builder first.",
          },
          {
            title: "Type a message to the partner if you want",
            detail: "If you leave it blank a standard message is sent.",
          },
          {
            title: 'Click "Confirm"',
          },
          {
            title: 'To refuse instead, click "Decline", type a reason and click "Confirm"',
          },
        ],
      },
      {
        id: "partners-release-lot-details",
        title: "Release the lot details to a partner",
        summary:
          "Show the partner the builder, estate, lot number and address once the hold is confirmed.",
        steps: [
          {
            title: 'Click "Hold requests & deals"',
          },
          {
            title: "Find the deal in the list",
          },
          {
            title: 'Click "Release lot details"',
            detail: "This button appears once a hold has been granted.",
          },
          {
            title: "Check each detail and fix anything that is wrong",
          },
          {
            title: 'Click "Confirm"',
            detail:
              "This shows the supplier to the partner. Only do it once the hold is confirmed and their agreement is signed.",
          },
        ],
      },
      {
        id: "partners-onboard-firm",
        title: "Onboard a new partner firm",
        summary: "Set up a new partner and give them their portal login.",
        steps: [
          {
            title: 'Click "Partner firms"',
          },
          {
            title: 'Click "Onboard a partner"',
            detail: "Only the business owner sees this button.",
          },
          {
            title: 'Pick the firm under "From the recruitment list (optional)"',
            detail: "This fills in their details for you. Skip it to type them yourself.",
          },
          {
            title: 'Fill in "Firm name" and "Contact email (their login)"',
            detail: "Both are required.",
          },
          {
            title: 'Choose the "Tier"',
          },
          {
            title: 'Leave "Email them their portal invitation now" ticked',
            detail: "The partner is emailed their invitation when you save.",
          },
          {
            title: 'Click "Onboard"',
          },
        ],
      },
      {
        id: "partners-add-login",
        title: "Add another login for a partner firm",
        summary: "Give a second person at a partner firm their own portal access.",
        steps: [
          {
            title: 'Click "Partner firms"',
          },
          {
            title: 'Click "Plan & branding" on the firm',
          },
          {
            title: 'Find "Add a login" at the bottom of the panel',
            detail: "It shows how many logins the firm has used.",
          },
          {
            title: "Type the person's email and full name",
          },
          {
            title: 'Click "Add & invite"',
            detail: "This emails the person their invitation straight away.",
          },
        ],
      },
    ],
  },
  {
    label: "Expressions of Interest",
    paths: ["/eoi"],
    about:
      "Prepares the Expression of Interest a buyer signs to put their name on a property.",
    guides: [
      {
        id: "eoi-create-new",
        title: "Create an Expression of Interest",
        summary: "Start a new EOI and fill in the buyer and property details.",
        steps: [
          {
            title: 'Click "+ New EOI"',
            detail: "A blank EOI opens.",
          },
          {
            title: 'Fill in the "Buyer/s" section',
            detail: 'Click "+ Add buyer" if there is more than one buyer.',
          },
          {
            title: 'Fill in the "Solicitor" section',
          },
          {
            title: 'Fill in the "Property", "Deposit" and "Finance" sections',
            detail: "Leave the purchase price blank if it is still to be confirmed.",
          },
          {
            title: 'Check the amber "Still to complete" note near the top',
            detail: "It lists anything you have missed.",
          },
          {
            title: 'Click "Save"',
            detail: "The button is in the bar at the bottom of the page.",
          },
        ],
      },
      {
        id: "eoi-send-for-signature",
        title: "Send an EOI for signing",
        summary:
          "Email the buyer a secure link to sign the EOI and attach their driver's licence.",
        steps: [
          {
            title: "Click the EOI in the list to open it",
          },
          {
            title: 'Click "Save" so the latest details are kept',
          },
          {
            title: 'Click "Send for signature"',
            detail: 'It is in the "Electronic signature" box.',
          },
          {
            title: "Check each signer's name and email",
            detail: 'Click "+ Add second signer" if two people need to sign.',
          },
          {
            title: 'Click "Send links"',
            detail: "This emails each signer their signing link straight away.",
          },
          {
            title: 'Watch the status in the "Electronic signature" box',
            detail: 'Click "Download" beside a signer once they have signed.',
          },
        ],
      },
      {
        id: "eoi-start-cdd",
        title: "Start the identity check from an EOI",
        summary:
          "Open a customer due diligence (CDD) case for the buyer using the EOI's details.",
        steps: [
          {
            title: "Click the EOI in the list to open it",
          },
          {
            title: 'Click "Start CDD from this EOI"',
            detail: "It is at the top right. The new CDD case opens.",
          },
          {
            title: 'Next time, click "View CDD case →" to go back to it',
            detail: "The button changes once a case is linked.",
          },
        ],
      },
      {
        id: "eoi-find-and-delete",
        title: "Find or delete an EOI",
        summary: "Filter the list by status, and remove an EOI made by mistake.",
        steps: [
          {
            title: 'Click "Draft", "Sent" or "Signed" above the table',
            detail: 'Click "All" to see everything again.',
          },
          {
            title: "Click the buyer or property name to open an EOI",
          },
          {
            title: 'To remove one, click "Delete" at the end of its row',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "This cannot be undone.",
          },
        ],
      },
    ],
  },
  {
    label: "Fact Find",
    paths: ["/fact-find"],
    about:
      "Records a borrower's full financial position, ready for signing and for the broker.",
    guides: [
      {
        id: "fact-find-start-from-contact",
        title: "Start a fact find for a client",
        summary:
          "Create a fact find with the client's details already filled in from their contact record.",
        steps: [
          {
            title: 'Click "From a contact"',
          },
          {
            title: "Type the client's name, email or phone in the search box",
          },
          {
            title: "Click the client in the list",
            detail: "The fact find opens with their details filled in.",
          },
          {
            title: "Work down the page and fill in each section",
            detail:
              'Start at "Individual applicants" and finish at "Privacy — notice & consent".',
          },
          {
            title: 'Click "Save"',
            detail: "It is at the right of the toolbar at the top.",
          },
          {
            title: 'For someone who is not a contact yet, click "+ New fact find" instead',
            detail: "This opens a blank fact find.",
          },
        ],
      },
      {
        id: "fact-find-send-for-signature",
        title: "Send a fact find for signing",
        summary: "Email the applicants a secure link to sign the fact find.",
        steps: [
          {
            title: "Click the applicant's name in the list to open the fact find",
          },
          {
            title: 'Click "Save" so the latest details are kept',
          },
          {
            title: 'Click "Send for signature"',
            detail: 'It is in the "Electronic signature" box near the top.',
          },
          {
            title: "Check each signer's name and email",
            detail: 'Click "+ Add second signer" for a joint application.',
          },
          {
            title: 'Click "Send links"',
            detail: "This emails each signer their signing link straight away.",
          },
          {
            title: 'Click "Download" beside a signer once they have signed',
          },
        ],
      },
      {
        id: "fact-find-create-needs-analysis",
        title: "Create a Needs Analysis from a fact find",
        summary:
          "Carry the fact find's details into a new Needs Analysis so you do not type them twice.",
        steps: [
          {
            title: "Open the fact find",
          },
          {
            title: 'Click "→ Create Needs Analysis"',
            detail: "It is in the toolbar at the top.",
          },
          {
            title: "Read the amber box that appears",
            detail: "It lists the items you need to review in the new Needs Analysis.",
          },
          {
            title: 'Click "Open Needs Analysis →"',
          },
        ],
      },
      {
        id: "fact-find-complete-and-download",
        title: "Mark a fact find complete and download it",
        summary: "Lock the finished fact find and save a PDF copy.",
        steps: [
          {
            title: "Open the fact find",
          },
          {
            title: 'Choose "Complete" in the status dropdown',
            detail: "It is in the toolbar. A red message lists anything still missing.",
          },
          {
            title: "Fill in anything the message asks for, then choose \"Complete\" again",
          },
          {
            title: 'Click "Download PDF"',
            detail: "The PDF saves to your computer.",
          },
          {
            title: 'To change it later, click "Reopen to amend"',
            detail: "A complete fact find is locked until you reopen it.",
          },
        ],
      },
    ],
  },
  {
    label: "Needs Analysis",
    paths: ["/needs-analysis"],
    about:
      "Records what the client needs from their loan and their income, assets and debts.",
    guides: [
      {
        id: "needs-analysis-start-new",
        title: "Start a Needs Analysis",
        summary: "Create a new Needs Analysis and fill it in with the client.",
        steps: [
          {
            title: 'Click "+ New needs analysis"',
            detail: "A blank Needs Analysis opens.",
          },
          {
            title: 'Fill in "Interview", "Needs & objectives" and "Loan basics"',
          },
          {
            title: 'Fill in "Applicants"',
          },
          {
            title: 'Fill in "Other income", "Assets" and "Liabilities"',
          },
          {
            title: 'Click "Save"',
            detail: "It is at the right of the toolbar at the top.",
          },
        ],
      },
      {
        id: "needs-analysis-send-for-signature",
        title: "Send a Needs Analysis for signing",
        summary: "Email the applicants a secure link to sign the Needs Analysis.",
        steps: [
          {
            title: "Click the applicant's name in the list to open it",
          },
          {
            title: 'Click "Save" so the latest details are kept',
          },
          {
            title: 'Click "Send for signature"',
            detail: 'It is in the "Electronic signature" box near the top.',
          },
          {
            title: "Check each signer's name and email",
            detail: 'Click "+ Add second signer" for a joint application.',
          },
          {
            title: 'Click "Send links"',
            detail: "This emails each signer their signing link straight away.",
          },
        ],
      },
      {
        id: "needs-analysis-create-credit-authorisation",
        title: "Create a Credit Authorisation from a Needs Analysis",
        summary:
          "Start the credit file authorisation with the applicants' names and address already filled in.",
        steps: [
          {
            title: "Open the Needs Analysis",
          },
          {
            title: 'Click "→ Create Credit Authorisation"',
            detail: "It is in the toolbar at the top. The new authorisation opens.",
          },
          {
            title: "Check the names and address on the new authorisation",
          },
        ],
      },
      {
        id: "needs-analysis-complete-and-download",
        title: "Mark a Needs Analysis complete and download it",
        summary: "Lock the finished Needs Analysis and save a PDF copy.",
        steps: [
          {
            title: "Open the Needs Analysis",
          },
          {
            title: 'Choose "Complete" in the status dropdown',
            detail: "It is in the toolbar. The document is then locked.",
          },
          {
            title: 'Click "Download PDF"',
            detail: "The PDF saves to your computer.",
          },
          {
            title: 'To change it later, click "Reopen to amend"',
          },
        ],
      },
    ],
  },
  {
    label: "Credit Authorisation",
    paths: ["/credit-authorisation"],
    about:
      "Holds the form a client signs to let us check their credit file.",
    guides: [
      {
        id: "credit-authorisation-start-new",
        title: "Create a Credit Authorisation",
        summary: "Start a new authorisation for a client to sign.",
        steps: [
          {
            title: 'Click "+ New authorisation"',
            detail: "A blank authorisation opens.",
          },
          {
            title: 'Type the client\'s name in the "Name/s" box',
            detail: "Put both names for a joint application.",
          },
          {
            title: 'Type their home address in the "Address" box',
          },
          {
            title: 'Click "Save"',
            detail: "It is at the right of the toolbar at the top.",
          },
        ],
      },
      {
        id: "credit-authorisation-send-for-signature",
        title: "Send a Credit Authorisation for signing",
        summary: "Email the client a secure link to sign the authorisation.",
        steps: [
          {
            title: "Click the applicant's name in the list to open it",
          },
          {
            title: 'Click "Send for signature"',
            detail: 'It is in the "Electronic signature" box near the top.',
          },
          {
            title: "Type each signer's name and email",
            detail: 'Click "+ Add second signer" for a joint application.',
          },
          {
            title: 'Click "Send links"',
            detail: "This emails each signer their signing link straight away.",
          },
          {
            title: 'Click "Download" beside a signer once they have signed',
          },
        ],
      },
      {
        id: "credit-authorisation-print-to-sign",
        title: "Print a Credit Authorisation to sign on paper",
        summary: "Use this when the client is signing in person.",
        steps: [
          {
            title: "Open the authorisation",
          },
          {
            title: 'Click "Print to sign"',
            detail: "The print window opens with just the form.",
          },
          {
            title: "Print it and have the client sign",
          },
          {
            title: 'Choose "Signed" in the status dropdown',
            detail: "The authorisation is then locked.",
          },
          {
            title: 'To change it later, click "Reopen to amend"',
          },
        ],
      },
    ],
  },
  {
    label: "Client Documents",
    paths: ["/document-requests"],
    about:
      "Sends clients a secure link to upload their loan documents and tracks what has come in.",
    guides: [
      {
        id: "document-requests-new-request",
        title: "Ask a client to upload their documents",
        summary: "Send a client a secure upload link for their loan documents.",
        steps: [
          {
            title: 'Type the client\'s name in "Applicant name" under "New request"',
            detail: "This is required.",
          },
          {
            title: 'Type their "Email" and "Phone"',
          },
          {
            title: 'Leave "Email the upload link to the applicant now" ticked',
            detail:
              "The client is emailed their link when you create the request. Untick it to send the link yourself.",
          },
          {
            title: 'Click "Create request"',
          },
          {
            title: 'Click "Copy" beside the link in the green box',
            detail: "The link is shown once only. If you lose it, create a new request.",
          },
        ],
      },
      {
        id: "document-requests-check-and-send-to-drive",
        title: "Check what a client has uploaded",
        summary:
          "See which documents are in, and send the full set to the Drive folder.",
        steps: [
          {
            title: "Click the client's name in the list",
            detail: "The row opens and shows every document needed.",
          },
          {
            title: "Read the count at the top of the open row",
            detail: 'A green tick means that document is in. "ready to submit" means all are in.',
          },
          {
            title: 'If a red "failed YLA check" tag shows, read the reasons listed',
          },
          {
            title: 'To remove a wrong file, click "Delete" beside it',
            detail:
              "The file is permanently removed and cannot be undone. The client's link will accept a new one.",
          },
          {
            title: 'Click "Send to Drive"',
            detail: 'If documents are missing the button says "Send partial set to Drive".',
          },
          {
            title: 'Click "Open Drive folder →" to check the files',
          },
        ],
      },
      {
        id: "document-requests-send-to-yla",
        title: "Send a finished application to Your Loan Assist",
        summary:
          "Release a checked and complete document set to Your Loan Assist (YLA).",
        steps: [
          {
            title: "Click the client's name in the list",
          },
          {
            title: 'Find the amber box "Ready for YLA — held for your check"',
            detail: "It only shows once the set is verified and in Drive.",
          },
          {
            title: 'Click "Check the Drive folder ↗"',
            detail: "Look through the files before you send.",
          },
          {
            title: 'Click "Send to YLA"',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "This emails Your Loan Assist straight away. It cannot be unsent.",
          },
          {
            title: 'When the assessment comes back, click "Mark PA received"',
          },
        ],
      },
      {
        id: "document-requests-cancel",
        title: "Cancel a document request",
        summary: "Stop a request you no longer need.",
        steps: [
          {
            title: "Find the client in the list",
          },
          {
            title: 'Click "Cancel" at the right of their row',
          },
          {
            title: 'Click "OK" to confirm',
            detail: "The client's upload link stops working.",
          },
        ],
      },
    ],
  },
  {
    label: "Preliminary Assessments",
    paths: ["/preliminary-assessments"],
    about:
      "Lists the assessments Your Loan Assist sends back, ready to match to a client and present.",
    guides: [
      {
        id: "preliminary-assessments-match-contact",
        title: "Match an assessment to its client",
        summary:
          "Link an assessment to the right contact when it was not matched automatically.",
        steps: [
          {
            title: "Read the amber note at the top",
            detail: "It tells you how many assessments still need matching.",
          },
          {
            title: 'Click "Match to a contact" in the "Contact" column',
          },
          {
            title: "Type the client's name, email or phone",
          },
          {
            title: "Click the right client in the list",
            detail: "Their name now shows in the Contact column.",
          },
          {
            title: 'If you picked the wrong person, click "remove"',
            detail: "Then match it again.",
          },
        ],
      },
      {
        id: "preliminary-assessments-present",
        title: "Present an assessment to a client",
        summary: "Read the assessment, then open a video call to take the client through it.",
        steps: [
          {
            title: "Find the client's assessment in the table",
            detail: "It must be matched to a contact first.",
          },
          {
            title: 'Click "View PDF"',
            detail: "The assessment opens in a new tab. Read it before the call.",
          },
          {
            title: 'Click "Open call"',
            detail: "The client's video room opens in a new tab.",
          },
          {
            title: 'Check the "Status" column afterwards',
            detail: "It shows where the assessment is up to.",
          },
        ],
      },
      {
        id: "preliminary-assessments-resend-signing",
        title: "Resend the signing links",
        summary: "Send fresh signing links when a client has lost or not used theirs.",
        steps: [
          {
            title: 'Find an assessment with the status "Sent for signing"',
          },
          {
            title: 'Click "Resend signing links"',
          },
          {
            title: 'Click "OK" to confirm',
            detail:
              "New links are emailed to everyone who has not signed. Their earlier links stop working.",
          },
        ],
      },
    ],
  },
];
