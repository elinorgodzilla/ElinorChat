import React, { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, Settings, Settings2 } from 'lucide-react';
import { AuthType, Permissions, PermissionTypes } from 'librechat-data-provider';
import { TooltipAnchor, DropdownPopup, PinIcon } from '@librechat/client';
import type { MenuItemProps } from '~/common';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

function ToolsDropdown({ disabled = false }: { disabled?: boolean }) {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const [isOpen, setIsOpen] = useState(false);
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  if (!context || !canUseWebSearch) {
    return null;
  }
  const { webSearch, searchApiKeyForm } = context;
  const { isPinned, setIsPinned, authData } = webSearch;
  const authTypes = authData?.authTypes ?? [];
  const showSettings =
    authTypes.length === 0 || !authTypes.every(([, type]) => type === AuthType.SYSTEM_DEFINED);
  const items: MenuItemProps[] = [
    {
      onClick: () => webSearch.debouncedChange({ value: !webSearch.toggleState }),
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <Globe className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_web_search')}</span>
          </div>
          <div className="flex items-center gap-1">
            {showSettings && (
              <button
                type="button"
                ref={searchApiKeyForm.menuTriggerRef}
                onClick={(e) => {
                  e.stopPropagation();
                  searchApiKeyForm.setIsDialogOpen(true);
                }}
                className="rounded p-1 text-text-secondary hover:bg-surface-secondary"
                aria-label={localize('com_ui_configure')}
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPinned(!isPinned);
              }}
              className="rounded p-1 text-text-secondary hover:bg-surface-secondary"
              aria-label={localize(isPinned ? 'com_ui_unpin' : 'com_ui_pin')}
            >
              <div className="h-4 w-4">
                <PinIcon unpin={isPinned} />
              </div>
            </button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <DropdownPopup
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
      menuId="tools-dropdown-menu"
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      modal={true}
      unmountOnHide={true}
      items={items}
      iconClassName="mr-0"
      trigger={
        <TooltipAnchor
          id="tools-dropdown-button"
          description={localize('com_ui_web_search')}
          disabled={disabled}
          render={
            <Ariakit.MenuButton
              disabled={disabled}
              id="tools-dropdown-button"
              aria-label={localize('com_ui_web_search')}
              className={cn(
                'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
                isOpen && 'bg-surface-hover',
              )}
            >
              <Settings2 className="size-5" aria-hidden="true" />
            </Ariakit.MenuButton>
          }
        />
      }
    />
  );
}

export default React.memo(ToolsDropdown);
