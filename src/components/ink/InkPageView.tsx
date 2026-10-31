import type { InkPage, StandaloneNote } from '../../types/daymark';
import { InkCanvas } from './InkCanvas';

export function InkPageView({ page, paper }: { page: InkPage; paper: StandaloneNote['paper'] }) {
  return <InkCanvas page={page} paper={paper} tool="pen" color="#1c1917" width={4} readOnly onChange={() => {}} />;
}
