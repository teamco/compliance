import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';

interface ReassignMember {
  userId: string;
  displayName?: string;
  email?: string;
}

interface ReassignDialogProps {
  open: boolean;
  isPending: boolean;
  title: string;
  members: ReassignMember[];
  currentAssigneeId: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newAssigneeId: string) => void;
}

export function ReassignDialog({
  open,
  isPending,
  title,
  members,
  currentAssigneeId,
  onOpenChange,
  onConfirm,
}: ReassignDialogProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState('');

  const options = members
    .filter((m) => m.userId !== currentAssigneeId)
    .map((m) => ({ value: m.userId, label: m.displayName ?? m.email ?? m.userId }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelectedId('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Combobox
          options={options}
          value={selectedId}
          onChange={setSelectedId}
          placeholder={t('reassign.selectMember')}
          searchPlaceholder={t('reassign.searchMembers')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('reassign.cancel')}
          </Button>
          <Button disabled={!selectedId || isPending} onClick={() => onConfirm(selectedId)}>
            {t('reassign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
