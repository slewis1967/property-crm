import { currentUserEmail, isUnauthenticated } from "../../utils/cf-access";
import FeedbackClient from "./FeedbackClient";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const email = await currentUserEmail();
  const submitter = isUnauthenticated(email) ? "" : email;
  return <FeedbackClient submitter={submitter} />;
}
