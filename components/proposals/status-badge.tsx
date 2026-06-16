import { FileEdit, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProposalStatus } from '@/lib/domain/proposal-types';

const meta: Record<
  ProposalStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning'; icon: typeof Radio }
> = {
  draft: { label: 'Draft', variant: 'outline', icon: FileEdit },
  active: { label: 'Active', variant: 'warning', icon: Radio },
  passed: { label: 'Passed', variant: 'success', icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'secondary', icon: XCircle },
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const m = meta[status];
  return (
    <Badge variant={m.variant} className="gap-1">
      <m.icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}
