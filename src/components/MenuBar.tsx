import { ThemeToggle } from './ThemeToggle';
import { ConnectionButton } from './ConnectionButton';
import { ApiVersionSwitcher } from './ApiVersionSwitcher';

import type { FC } from 'react';

export const MenuBar: FC = () => {
  return (
    <div className="flex h-9 items-center justify-between border-b px-4">
      <div className="flex items-center space-x-2">
        <img src="https://gptme.org/media/logo.png" alt="gptme logo" className="w-4" />
        <span className="font-mono text-base font-semibold">gptme</span>
      </div>
      <div className="flex items-center gap-4">
        <ApiVersionSwitcher />
        <ConnectionButton />
        <ThemeToggle />
      </div>
    </div>
  );
};
