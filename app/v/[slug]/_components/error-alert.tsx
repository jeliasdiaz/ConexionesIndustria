import type { ReactNode } from 'react';
import { IconAlert } from '@/app/icons';

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p className="alert error" role="alert">
      <IconAlert />
      <span>{children}</span>
    </p>
  );
}
