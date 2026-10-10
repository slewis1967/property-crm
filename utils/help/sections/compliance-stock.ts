import type { HelpSection } from "../types";

/**
 * Help content for the "Compliance" and "Stock" sidebar groups.
 *
 * Every step names a control exactly as it is labelled on screen (button
 * icons and live counts are left out of the label). If a label changes in the
 * page, change it here too, because each guide is also recorded as a video.
 */
export const complianceStockSections: HelpSection[] = [
  // ───────────────────────────── Compliance ─────────────────────────────
  {
    label: "CDD Cases",
    paths: ["/aml"],
    about:
      "Keep a Customer Due Diligence record for each buyer and seller, including their identity, source of funds, risk and screening results.",
    guides: [
      {
        id: "aml-start-cdd-case",
        title: "Start a CDD case for a buyer or seller",
        summary:
          "Open a new case and fill in the identity, source of funds and risk details for one party.",
        steps: [
          {
            title: 'Choose the party type next to "New CDD case:"',
            detail:
              "Pick Individual, Company, Trust or SMSF. The type cannot be changed after the case is created.",
          },
          {
            title: 'Click "+ Start CDD"',
            detail: "The new case opens straight away.",
          },
          {
            title: 'Choose the "Role in transaction"',
            detail: "Pick buyer, seller or other.",
          },
          {
            title: 'Fill in the "Identity" section',
            detail:
              'For a company, trust or SMSF this section is called "Entity", and you click "+ Add owner" for each beneficial owner.',
          },
          {
            title: 'Fill in "Source of funds"',
            detail:
              'Choose a "Category", type the "Description / evidence", and tick "Source of funds evidenced" once you have it.',
          },
          {
            title: 'Tick any boxes that apply under "Risk assessment"',
            detail: 'The "Derived rating" underneath updates by itself.',
          },
          {
            title: 'Check the "CDD completeness" box near the top',
            detail: "It lists anything still missing.",
          },
          {
            title: 'Click "Save"',
            detail:
              "The button is in the bar at the bottom. The case also saves by itself while you type.",
          },
        ],
      },
      {
        id: "aml-record-screening",
        title: "Record a screening result",
        summary:
          "Log the result of a sanctions, PEP and adverse media check for the party and each beneficial owner.",
        steps: [
          {
            title: "Click the party name in the list",
            detail: "This opens the case.",
          },
          {
            title: 'Scroll to "Sanctions / PEP / adverse-media screening"',
            detail:
              "Each party and beneficial owner has its own row. A name must be entered before a row appears.",
          },
          {
            title: "Choose the result in the dropdown on that row",
            detail: "Pick Clear, Potential match or Confirmed match.",
          },
          {
            title: 'Click "Record screening"',
            detail:
              'The result is added to "Screening history" and cannot be removed. A Confirmed match changes the case status to Blocked.',
          },
          {
            title: "Repeat for each row",
            detail: "Every party and beneficial owner needs its own result.",
          },
        ],
      },
      {
        id: "aml-clear-case",
        title: "Mark a case as cleared",
        summary:
          "Lock a finished case once every required field is captured and the screening is clear.",
        steps: [
          {
            title: "Click the party name in the list",
            detail: "This opens the case.",
          },
          {
            title: 'Check "CDD completeness" says "All required fields captured"',
            detail: 'If it shows a number outstanding, fill in the items listed after "Missing:".',
          },
          {
            title: "Check the latest screening result is Clear",
            detail:
              'The "Mark cleared" button only appears when the case is complete and the screening is clear.',
          },
          {
            title: 'Click "Mark cleared"',
            detail:
              "The button is in the bar at the bottom. The case is then locked and its fields cannot be edited.",
          },
          {
            title: "To change a cleared case, choose another status in the bottom bar",
            detail: 'Then click "Save". Every change is recorded in the "Audit trail".',
          },
        ],
      },
      {
        id: "aml-find-or-delete-case",
        title: "Find a case, or delete one made by mistake",
        summary:
          "Narrow the list by status, see which cases are due for review, and remove a case that should not exist.",
        steps: [
          {
            title: "Click a status button above the list",
            detail:
              "Choose All, Draft, In Progress, Screening, Enhanced DD, Cleared or Blocked. Each shows how many cases it holds.",
          },
          {
            title: 'Look for the "review due" tag in the "Updated" column',
            detail: "It marks cases whose ongoing review date has arrived.",
          },
          {
            title: "Click the party name",
            detail: "This opens the case.",
          },
          {
            title: 'To remove a case, click "Delete" at the end of its row',
            detail:
              "You are asked to confirm. This cannot be undone. A Cleared case cannot be deleted.",
          },
        ],
      },
    ],
  },
  {
    label: "AUSTRAC Reports",
    paths: ["/aml/reports"],
    about:
      "Keep a register of the SMR, TTR and IFTI reports the business has to lodge with AUSTRAC, with their due dates and lodgement references.",
    guides: [
      {
        id: "aml-reports-create-report",
        title: "Create a report record",
        summary:
          "Add a report to the register so its due date is worked out and tracked.",
        steps: [
          {
            title: 'Choose the "Type" under "New report"',
            detail: "Pick SMR, TTR or IFTI.",
          },
          {
            title: 'Type the "Subject"',
            detail: "This is the party or transaction the report is about.",
          },
          {
            title: 'Set the "Trigger date"',
            detail: "It starts on today's date.",
          },
          {
            title: 'For an SMR, tick "Terrorism-related (24-hour deadline)" if it applies',
            detail: "This box only shows when the type is SMR.",
          },
          {
            title: "Check the due date shown under the form",
            detail: "It changes as you change the type and the trigger date.",
          },
          {
            title: 'Click "+ Create report"',
            detail: "The report appears in the list below.",
          },
        ],
      },
      {
        id: "aml-reports-mark-lodged",
        title: "Mark a report as lodged",
        summary:
          "Record the AUSTRAC reference once a report has been lodged with AUSTRAC.",
        steps: [
          {
            title: "Find the report in the list",
            detail: 'Overdue reports show "(overdue)" in red in the "Due" column.',
          },
          {
            title: 'Click "Mark lodged" at the end of the row',
            detail: "A box pops up asking for the reference.",
          },
          {
            title: "Type the AUSTRAC lodgement reference and click OK",
            detail:
              "The status changes to lodged and shows the reference. A lodged report cannot be changed or deleted on this screen.",
          },
        ],
      },
      {
        id: "aml-reports-delete-report",
        title: "Delete a report record made by mistake",
        summary: "Remove a report that has not been lodged.",
        steps: [
          {
            title: "Find the report in the list",
            detail: 'Only reports that are not lodged have a "Delete" link.',
          },
          {
            title: 'Click "Delete" at the end of the row',
            detail: "You are asked to confirm.",
          },
          {
            title: "Click OK",
            detail: "The report is removed. This cannot be undone.",
          },
        ],
      },
    ],
  },
  {
    label: "Program & Enrolment",
    paths: ["/aml/program"],
    about:
      "Keep the record of the AML/CTF program itself: AUSTRAC enrolment, the compliance officer, approvals, the risk assessment and staff training.",
    guides: [
      {
        id: "aml-program-update-enrolment",
        title: "Update the enrolment and compliance officer details",
        summary:
          "Record the AUSTRAC enrolment status and who the compliance officer is.",
        steps: [
          {
            title: 'Choose the "Enrolment status" under "AUSTRAC enrolment"',
            detail: "Pick Not started, In progress or Enrolled.",
          },
          {
            title: 'Fill in "AUSTRAC reference" and "Enrolled on"',
          },
          {
            title: 'Fill in "Name", "Email" and "Appointed on" under "Compliance officer"',
          },
          {
            title: 'Set "Compliance officer notified to AUSTRAC on"',
            detail: "Until this is filled in, the page shows the date it is due by.",
          },
          {
            title: 'Click "Save program"',
            detail:
              "The button is in the bar at the bottom. Nothing in these sections is saved until you click it.",
          },
        ],
      },
      {
        id: "aml-program-add-training",
        title: "Add a staff training record",
        summary: "Log that a staff member has completed AML/CTF training.",
        steps: [
          {
            title: 'Scroll to "Staff training register"',
          },
          {
            title: 'Type the "Staff name" and "Email"',
          },
          {
            title: 'Check the "Module" box',
            detail: 'It starts as "AML/CTF awareness". Type over it for a different module.',
          },
          {
            title: "Choose the date the training was completed",
          },
          {
            title: 'Click "Add"',
            detail:
              'The record is saved straight away and appears in the table. You do not need to click "Save program".',
          },
          {
            title: 'To take a record out, click "Remove" on its row',
            detail: "It is removed straight away with no confirmation. This cannot be undone.",
          },
        ],
      },
      {
        id: "aml-program-smr-access",
        title: "Choose who can see Suspicious Matter Reports",
        summary:
          "Add or remove people who are allowed to see SMRs on the AUSTRAC Reports page.",
        steps: [
          {
            title: 'Scroll to "Suspicious Matter Report access"',
          },
          {
            title: 'Type the email address in "Additional people who may view SMRs (one email per line)"',
            detail:
              "To add several at once, paste them in with one email on each line. The compliance officer and the person who created a report can always see it.",
          },
          {
            title: "Delete a line to take that person off the list",
          },
          {
            title: 'Click "Save program"',
            detail: "The change does not apply until you save.",
          },
        ],
      },
      {
        id: "aml-program-check-outstanding",
        title: "Check what is outstanding on the program",
        summary:
          "See which program obligations are still open and record them as they are done.",
        steps: [
          {
            title: 'Read the "Outstanding program obligations" box near the top',
            detail: "It only shows when something is outstanding.",
          },
          {
            title: 'Check the dates under "Program approval" and "Independent evaluation"',
            detail: 'Look at "Next review due" and "Next due".',
          },
          {
            title: 'Check "Due" and "Lodged" under "AUSTRAC compliance report"',
          },
          {
            title: "Fill in any dates and details that are now complete",
          },
          {
            title: 'Click "Save program"',
            detail: "The outstanding list updates as you fill things in.",
          },
        ],
      },
    ],
  },

  // ─────────────────────────────── Stock ────────────────────────────────
  {
    label: "Aggregator Feed",
    paths: ["/properties", "/compare"],
    about:
      "Browse all the stock we currently hold from builders, find properties that suit a client, and send or compare them.",
    guides: [
      {
        id: "properties-find-stock",
        title: "Find properties that suit a client",
        summary:
          "Search and filter the feed down to the stock that matches a budget, location and size.",
        steps: [
          {
            title: 'Type in the "Search suburb, builder, estate, address, lot…" box',
            detail: "The feed updates as you type.",
          },
          {
            title: 'Set the "Price range"',
            detail: 'Type a Min and Max, or click a quick button such as "$500-700k".',
          },
          {
            title: 'Choose a "State", "Builder / estate" or "Property type"',
          },
          {
            title: 'Click a number under "Bedrooms", "Bathrooms" or "Car spaces"',
            detail: '"3+" means three or more.',
          },
          {
            title: 'Narrow further with "Contract", "Status" or "Titled"',
            detail: "These three only filter the properties already loaded on the page.",
          },
          {
            title: 'Click "Clear all" to start again',
            detail: "It appears next to the Filters button when a filter is on.",
          },
          {
            title: 'Click "Load more" at the bottom',
            detail:
              'This brings in the rest of the feed. You can also change how many load at a time in the "Show" dropdown.',
          },
        ],
      },
      {
        id: "properties-send-to-client",
        title: "Send a shortlist of properties to a client",
        summary:
          "Email a client a private link to the properties you picked, with reports attached.",
        steps: [
          {
            title: "Tick the box at the top left of each property you want to send",
            detail: "A count of ticked properties shows above the cards.",
          },
          {
            title: 'Click "Send to client"',
            detail: "The button appears above the cards, on the right.",
          },
          {
            title: 'Type the client\'s name in "Search contacts by name or email…" and click them',
            detail:
              'This fills in "Client name" and "Client email" and links the shortlist to their contact page.',
          },
          {
            title: "Add a heading and a short note under Message",
            detail: "Both are optional. Do not name builders or estates. The client page hides them.",
          },
          {
            title: 'For each property, type the "Expected rent $/wk" and "Why we picked it (shown to the client)"',
            detail: "Both are optional, but the rent is needed for the cashflow report.",
          },
          {
            title: 'Check "Report assumptions" and who the "Book a call" button books with',
          },
          {
            title: 'Click "Review & send", then "Yes, send it"',
            detail:
              "This emails the client. It cannot be unsent. Check the name and email in the yellow bar first.",
          },
          {
            title: 'Click "Copy link", then "Done"',
            detail: "The link is only shown once. If it is lost, send a new shortlist.",
          },
        ],
      },
      {
        id: "properties-compare",
        title: "Compare properties side by side",
        summary: "Put two or more properties next to each other to see how they differ.",
        steps: [
          {
            title: "Tick the box at the top left of two or more properties",
          },
          {
            title: 'Click "Compare"',
            detail:
              "The button appears above the cards once two or more are ticked. It opens the Property Comparison page.",
          },
          {
            title: "Read the card for each property",
            detail: "Each one shows price, address, size, builder and description.",
          },
          {
            title: 'Scroll down to "Side-by-Side Comparison"',
            detail: "The table lines up price, bedrooms, bathrooms, car spaces, sizes, builder and status.",
          },
          {
            title: 'Click "Detail →" on a card to open that property',
          },
          {
            title: 'Click "Clear Comparison" when you are finished',
            detail: 'Then click "Browse Properties" to go back to the feed.',
          },
        ],
      },
      {
        id: "properties-view-detail",
        title: "Open a property and see its full details",
        summary:
          "See the price breakdown, brochure and floor plan for one property, and which contacts it suits.",
        steps: [
          {
            title: 'Click "Detail →" on the property card',
          },
          {
            title: 'Read "Total package", "Specs" and "Origin"',
            detail: "These show the price breakdown, the sizes, the builder, estate and lot.",
          },
          {
            title: 'Click "Download brochure"',
            detail: "It opens in a new tab. The button only shows when we hold a brochure.",
          },
          {
            title: 'Scroll down to "Contacts that fit this property"',
            detail: "Click a name to open that contact.",
          },
          {
            title: 'Click "Create EOI" to start an expression of interest for this property',
            detail: 'Or click "Planning Feasibility" to check the site.',
          },
          {
            title: 'To record our fee, type it in "Gross developer fee (AUD)" and click "Save"',
            detail: "This is for our records only. Clients never see it.",
          },
        ],
      },
    ],
  },
  {
    label: "Stock Map",
    paths: ["/properties/map"],
    about:
      "See where our stock is on a map, with one bubble per suburb sized by how many properties we hold there.",
    guides: [
      {
        id: "properties-map-find-stock-in-area",
        title: "See what stock we have in an area",
        summary: "Use the map to find suburbs with stock and open the properties in them.",
        steps: [
          {
            title: "Set the filters above the map",
            detail:
              'Use the search box, "All states", "All builders", "All types", "Any beds", "Min $" and "Max $".',
          },
          {
            title: "Click a bubble on the map",
            detail:
              'Bigger bubbles hold more properties. You can also click a suburb in the "Suburbs by volume" list.',
          },
          {
            title: "Read the suburb summary on the right",
            detail: "It shows how many properties, the price range, the median price and the number of builders.",
          },
          {
            title: "Click a property in the list to open it",
          },
          {
            title: 'Click "← All suburbs" to go back to the full list',
          },
          {
            title: 'Click "Clear" to remove the filters',
            detail: "It appears at the end of the filter bar when a filter is on.",
          },
        ],
      },
      {
        id: "properties-map-street-view",
        title: "Look at a suburb in satellite or Street View",
        summary: "Change the map style and open Street View to get a feel for the area.",
        steps: [
          {
            title: 'Click "Streets", "Satellite" or "Satellite + labels"',
            detail: "These buttons are at the top right of the map. Your choice is remembered.",
          },
          {
            title: "Click a bubble on the map",
          },
          {
            title: 'Click "Street View · suburb centre ↗"',
            detail: "It opens in a new tab at the middle of the suburb, not at a particular property.",
          },
          {
            title: 'Click "Street View ↗" under a property',
            detail: "This only shows for properties with a street address on file.",
          },
        ],
      },
      {
        id: "properties-map-read-and-locate",
        title: "Check what the map is showing and place missing suburbs",
        summary:
          "Read the colours and counts, and put suburbs on the map that have not been placed yet.",
        steps: [
          {
            title: "Read the counts above the map",
            detail: 'They show how many properties are mapped, how many suburbs, and how many are "not placed".',
          },
          {
            title: 'Read the "Median package price:" colours under the map',
            detail: "Each bubble is coloured by the middle price of the stock in that suburb.",
          },
          {
            title: 'Click the "Locate ... suburbs" button if it shows',
            detail: "It only appears when there are suburbs the map has never looked up. It can take a minute.",
          },
          {
            title: 'Scroll to "Not on the map" at the bottom of the suburb list',
            detail: "It lists stock that could not be placed, and why.",
          },
        ],
      },
    ],
  },
  {
    label: "Review Queue",
    paths: ["/aggregator/review"],
    about:
      "Check properties the system was not confident it read correctly from a builder's stocklist, then publish or discard them.",
    guides: [
      {
        id: "aggregator-review-approve-item",
        title: "Check and approve a property",
        summary:
          "Open an item, fix anything that was read wrongly, and publish it to the Aggregator Feed.",
        steps: [
          {
            title: "Click an item in the list to open it",
            detail: "The line under the heading says why it was flagged.",
          },
          {
            title: "Check each field against the builder's stocklist",
            detail: 'Fields marked "(empty)" could not be read.',
          },
          {
            title: "Type the correct value into any field that is wrong or empty",
            detail:
              'Put the price in "House price", or "House price" and "Land price". An item cannot be approved without one, and "Total package" on its own is not enough.',
          },
          {
            title: 'Click "Approve & publish"',
            detail: "The property goes into the Aggregator Feed with your corrections.",
          },
        ],
      },
      {
        id: "aggregator-review-reject-item",
        title: "Reject a property that should not be published",
        summary: "Discard an item that is wrong, a duplicate, or not real stock.",
        steps: [
          {
            title: "Click the item to open it",
          },
          {
            title: 'Click "Reject"',
            detail: "A box pops up asking for a reason.",
          },
          {
            title: "Type a reason and click OK",
            detail:
              "The reason is optional. The item is rejected and is not published. It cannot be moved back to pending on this screen.",
          },
        ],
      },
      {
        id: "aggregator-review-bulk",
        title: "Approve or reject several items at once",
        summary: "Clear a batch of items in one go when they do not need editing.",
        steps: [
          {
            title: "Tick the box on each item",
            detail: "Or tick the box in the bar at the top of the list to select them all.",
          },
          {
            title: 'Click "Approve" or "Reject" in the bar at the top',
            detail: "Each button shows how many items are ticked.",
          },
          {
            title: "Click OK to confirm",
            detail:
              "Items approved this way are published exactly as they were read. Any edits you typed are not applied, and an item with no price is skipped. Rejecting also asks for an optional reason.",
          },
          {
            title: 'Click "Clear" to untick everything',
          },
        ],
      },
      {
        id: "aggregator-review-history",
        title: "See what has already been approved or rejected",
        summary: "Look back at past decisions and re-order the list.",
        steps: [
          {
            title: 'Click the "Approved" or "Rejected" tab',
            detail: "The tabs are above the list.",
          },
          {
            title: 'Choose an order in the "Sort:" dropdown',
            detail: "Sort by confidence or by date.",
          },
          {
            title: "Click an item to see its details",
            detail: "Approved and rejected items cannot be edited.",
          },
          {
            title: 'Click the "Pending" tab to go back to the items waiting for review',
          },
        ],
      },
    ],
  },
  {
    label: "Ingestion Runs",
    paths: ["/aggregator/runs"],
    about:
      "See a log of every builder stocklist the system has processed, what it added or changed, and which sources have gone quiet.",
    guides: [
      {
        id: "aggregator-runs-check-stocklist",
        title: "Check that a builder's stocklist was processed",
        summary: "Confirm a stocklist email came through and see what it changed.",
        steps: [
          {
            title: 'Find the builder in the "Builder" column of the bottom table',
            detail: "The newest runs are at the top. The page shows the last 100.",
          },
          {
            title: 'Check the "Status" column',
            detail: "A failed run shows the error in red under the email subject.",
          },
          {
            title: 'Read the "+New", "~Upd", "-Wdrn" and "?Rev" columns',
            detail:
              "These are properties added, updated, withdrawn, and sent to the Review Queue.",
          },
          {
            title: 'If "?Rev" is above zero, open "Review Queue" in the sidebar',
            detail: "Those properties wait there until someone approves them.",
          },
        ],
      },
      {
        id: "aggregator-runs-stale-sources",
        title: "Spot a builder whose stock has stopped updating",
        summary: "Use the Source health table to find sources that have failed or gone stale.",
        steps: [
          {
            title: 'Find the "Source health" table',
            detail: "It has one row per builder. The builders that have gone longest without a change are at the top.",
          },
          {
            title: 'Check the "Last read OK" column',
            detail: "Red means the source has not been read successfully for more than three days.",
          },
          {
            title: 'Check the "Last change" column',
            detail: "Amber means nothing has been added or updated for more than two weeks.",
          },
          {
            title: 'Check the "Last run" column for the latest status and time',
          },
        ],
      },
    ],
  },
  {
    label: "Builders",
    paths: ["/aggregator/builders"],
    about:
      "Track builders we are signing up, and manage the builders we already receive stock from.",
    guides: [
      {
        id: "aggregator-builders-move-prospect",
        title: "Move a prospect builder to the next stage",
        summary:
          "Record that an agreement has been requested or signed, and onboard the builder when they are ready to send stock.",
        steps: [
          {
            title: 'Find the builder under "Prospect builders"',
            detail: 'Click a stage button such as "In progress" or "Prospect" to narrow the cards.',
          },
          {
            title: 'Click "Agreement requested" on the card',
            detail: "Do this once the agreement has been asked for. The date is recorded.",
          },
          {
            title: 'Click "Agreement signed" when the signed agreement is back',
          },
          {
            title: 'Click "Onboarded", then OK to confirm',
            detail:
              'This adds the builder to "Stock builders" below as an active supplier. There is no Undo after this step.',
          },
          {
            title: 'Click "Undo" to step back one stage',
            detail: "Undo only shows on the two agreement stages.",
          },
        ],
      },
      {
        id: "aggregator-builders-confirm-draft",
        title: "Confirm a new builder marked as a draft",
        summary:
          "Check a builder the system created by itself from an incoming email, and correct its details.",
        steps: [
          {
            title: 'Find the card marked "DRAFT — needs review" under "Stock builders"',
            detail: "Draft cards have an amber border.",
          },
          {
            title: 'Click "Edit"',
          },
          {
            title: 'Correct the "Canonical name"',
            detail: "This is the one name all of this builder's stock is grouped under.",
          },
          {
            title: 'Fill in "Aliases (comma-separated)" and "Sender domains (comma-separated)"',
            detail:
              "Aliases are other names the builder uses. Sender domains are the email addresses their stocklists come from.",
          },
          {
            title: 'Fill in "Contact email" and "Contact phone"',
          },
          {
            title: 'Click "Save"',
            detail: "Saving removes the draft label.",
          },
        ],
      },
      {
        id: "aggregator-builders-extraction-hints",
        title: "Help the system read a builder's stocklist",
        summary:
          "Add notes and a sample stocklist so properties from this builder are read more accurately.",
        steps: [
          {
            title: 'Click "Edit" on the builder card',
          },
          {
            title: 'Type in "Notes for the extractor"',
            detail: 'For example "ignore Display Home rows" or "pricing is in $1,000s".',
          },
          {
            title: 'Click "Upload sample" and choose a PDF or Excel stocklist',
            detail: "It uploads as soon as you choose the file. The list reloads for a moment.",
          },
          {
            title: 'Check it now says "Sample uploaded"',
            detail: 'Click "View" to open the file, or "Remove" to take it off.',
          },
          {
            title: 'Click "Save"',
            detail: "Your notes are only kept when you save. The sample is kept either way.",
          },
        ],
      },
      {
        id: "aggregator-builders-pause-or-deactivate",
        title: "Pause emails to a builder or switch them off",
        summary:
          "Stop the automatic stocklist request emails to a builder, or mark the builder as inactive.",
        steps: [
          {
            title: 'Find the builder under "Stock builders"',
            detail: 'The card shows "Last stocklist received" and whether "Auto-outreach" is enabled.',
          },
          {
            title: 'Click "Pause auto-emails"',
            detail:
              'The button changes to "Resume auto-emails". It cannot be used on a draft builder.',
          },
          {
            title: 'Click "Deactivate" to mark the builder inactive',
            detail: 'The card shows an "inactive" tag.',
          },
          {
            title: 'Click "Activate" or "Resume auto-emails" to switch them back on',
          },
        ],
      },
    ],
  },
  {
    label: "Suburb Intelligence",
    paths: ["/suburbs"],
    about:
      "Look up the median price, growth, population and key infrastructure for the suburbs we track.",
    guides: [
      {
        id: "suburbs-read-suburb-card",
        title: "Look up the numbers for a suburb",
        summary: "Read the price, growth and infrastructure details on a suburb card.",
        steps: [
          {
            title: "Scroll to the card for the suburb",
            detail: "There is one card per suburb. The count at the top right shows how many there are.",
          },
          {
            title: "Read the percentage at the top right of the card",
            detail: "This is price growth. Green is up and red is down.",
          },
          {
            title: 'Read "Median Price" and "Population"',
          },
          {
            title: 'Check "Last Updated"',
            detail: "This is when the figures were last refreshed.",
          },
          {
            title: 'Read the "Infrastructure" list',
            detail: "It shows up to three items, when we hold them.",
          },
        ],
      },
      {
        id: "suburbs-elvis-brief",
        title: "Get a written summary of a suburb",
        summary: "Ask Elvis for a short written brief on a suburb to use when talking to a client.",
        steps: [
          {
            title: "Scroll to the card for the suburb",
          },
          {
            title: 'Click "Elvis brief"',
            detail: "The button is at the bottom of the card. The brief takes a few seconds to appear.",
          },
          {
            title: "Read the brief",
            detail: 'A small "cached" label means it was written earlier and saved.',
          },
          {
            title: 'Click "close" to hide it',
          },
        ],
      },
    ],
  },
];
