/**
 * "How do I do this?" help — shared types.
 *
 * A section is one area of the CRM (usually one sidebar link). Each section
 * has one or more guides, and each guide is a single task a person wants to
 * get done: a short video plus the same steps written out.
 */

export type HelpStep = {
  /** What to do, as an instruction: "Click New contact". */
  title: string;
  /** Optional extra line: where the button is, or what happens next. */
  detail?: string;
};

export type HelpGuide = {
  /** Unique, kebab-case. The video file is /help/<id>.mp4. */
  id: string;
  /** The task, phrased the way someone would ask it: "Add a new contact". */
  title: string;
  /** One sentence on what the task achieves and when you'd do it. */
  summary: string;
  steps: HelpStep[];
};

export type HelpSection = {
  /** Sidebar label, e.g. "Contacts". */
  label: string;
  /**
   * Path prefixes this section covers. "/contacts" matches /contacts and
   * /contacts/123. "/" only ever matches the home page.
   */
  paths: string[];
  /** One line on what this part of the CRM is for. */
  about: string;
  guides: HelpGuide[];
};
