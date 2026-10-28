import React from 'react';
import { Dialog } from '../ui/Dialog';
import { RelatedContents, type RelatedPanelProps } from './RelatedPanel';

export function RelatedSheet({ isOpen, onClose, ...props }: Omit<RelatedPanelProps, 'minimized' | 'onToggleMinimized'> & { isOpen: boolean; onClose(): void }) {
  return <Dialog isOpen={isOpen} onClose={onClose} title="Related" variant="sheet"><RelatedContents {...props} /></Dialog>;
}
