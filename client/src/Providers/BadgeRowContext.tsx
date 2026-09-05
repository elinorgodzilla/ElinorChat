import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import { Tools, Constants, LocalStorageKeys } from 'librechat-data-provider';
import { useSearchApiKeyForm, useToolToggle } from '~/hooks';
import { getTimestampedValue } from '~/utils/timestamps';
import { projectSearchState } from '~/utils/ephemeral';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';

interface BadgeRowContextType {
  webSearch: ReturnType<typeof useToolToggle>;
  searchApiKeyForm: ReturnType<typeof useSearchApiKeyForm>;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  return useContext(BadgeRowContext);
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  isSubmitting?: boolean;
  conversationId?: string | null;
  specName?: string | null;
}

export default function BadgeRowProvider({
  children,
  isSubmitting,
  conversationId,
  specName,
}: BadgeRowProviderProps) {
  const lastContextKeyRef = useRef<string>();
  const { data: startupConfig } = useGetStartupConfig();
  const key = conversationId ?? Constants.NEW_CONVO;
  const storageContextKey =
    !specName && (startupConfig?.modelSpecs?.list?.length ?? 0) > 0
      ? (Constants.spec_defaults_key as string)
      : undefined;
  const storageSuffix = key === Constants.NEW_CONVO ? (storageContextKey ?? key) : key;
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));

  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    if (specName) {
      lastContextKeyRef.current = undefined;
      return;
    }
    if (lastContextKeyRef.current === storageSuffix) {
      return;
    }
    lastContextKeyRef.current = storageSuffix;
    const raw = getTimestampedValue(`${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${storageSuffix}`);
    const storedValue = raw === 'true' || raw === 'false' ? raw === 'true' : undefined;
    setEphemeralAgent((prev) =>
      projectSearchState({ web_search: projectSearchState(prev)?.web_search ?? storedValue }),
    );
  }, [storageSuffix, specName, isSubmitting, setEphemeralAgent]);

  const searchApiKeyForm = useSearchApiKeyForm({});
  const webSearch = useToolToggle({
    conversationId,
    storageContextKey,
    toolKey: Tools.web_search,
    localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
    setIsDialogOpen: searchApiKeyForm.setIsDialogOpen,
    authConfig: {
      toolId: Tools.web_search,
      queryOptions: { retry: 1 },
    },
  });

  return (
    <BadgeRowContext.Provider value={{ webSearch, searchApiKeyForm }}>
      {children}
    </BadgeRowContext.Provider>
  );
}
