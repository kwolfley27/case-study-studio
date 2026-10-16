import CaseStudyBuilder from './CaseStudyBuilder';
import { AccountGate } from './AccountGate';

/* The editor, behind sign-in. */
export default function StudioEntry() {
  return <AccountGate>{account => <CaseStudyBuilder account={account} />}</AccountGate>;
}
