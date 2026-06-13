import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Globe, Loader2, Plus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateVendor, useVendors, type Vendor, type VendorInput } from '@/queries/vendors';
import { useActiveOrgStore } from '@/stores/active-org';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 border-green-500/30 bg-green-500/10',
  B: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  C: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  D: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  F: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const TIER_COLOR: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const TIER_OPTIONS: Array<VendorInput['tier']> = ['critical', 'high', 'medium', 'low'];

function VendorCard({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/vendors/$id"
      params={{ id: vendor.id }}
      className="group bg-surface border border-border rounded-xl p-5 flex gap-4 hover:border-muted-foreground/40 transition-colors cursor-pointer"
    >
      <div
        className={`flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 shrink-0 ${GRADE_COLOR['?'] ?? 'text-muted-foreground border-border bg-muted'}`}
      >
        <span className="text-lg font-bold leading-none text-muted-foreground">?</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate">{vendor.name}</span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${TIER_COLOR[vendor.tier] ?? ''}`}
          >
            {vendor.tier}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
          <Globe size={11} />
          <span className="truncate">{vendor.domain}</span>
        </div>
        {vendor.lastScannedAt ? (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {t('vendors.lastScanned', {
              date: new Date(vendor.lastScannedAt).toLocaleDateString(),
            })}
          </p>
        ) : (
          <p className="text-[10px] text-amber-400/70 mt-1">{t('vendors.neverScanned')}</p>
        )}
      </div>
    </Link>
  );
}

function AddVendorDialog({
  open,
  orgId,
  onClose,
}: {
  open: boolean;
  orgId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateVendor(orgId);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [tier, setTier] = useState<VendorInput['tier']>('medium');

  function submit() {
    if (!name.trim() || !domain.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        domain: domain.trim(),
        tier,
        tags: [],
        rescanIntervalDays: 7,
        alertThreshold: 10,
      },
      {
        onSuccess: () => {
          onClose();
          setName('');
          setDomain('');
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vendors.addVendor')}</DialogTitle>
          <DialogDescription className="sr-only">{t('vendors.addVendor')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder={t('vendors.vendorName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={t('vendors.domain')}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <Select value={tier} onValueChange={(v) => setTier(v as VendorInput['tier'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((tierOption) => (
                <SelectItem key={tierOption} value={tierOption}>
                  {tierOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            {t('vendors.addVendor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';
  const { data: vendors = [], isPending } = useVendors(orgId);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield size={20} className="text-green-500" />
            {t('vendors.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('vendors.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('vendors.addVendor')}
        </Button>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5 h-24 animate-pulse"
            />
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('vendors.empty')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => setAddOpen(true)}
            disabled={!orgId}
          >
            {t('vendors.addFirst')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {vendors.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      )}

      {orgId && <AddVendorDialog open={addOpen} orgId={orgId} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/vendors')({
  component: VendorsPage,
});
