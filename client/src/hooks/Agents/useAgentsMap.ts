import { useMemo } from 'react';
import { PermissionBits, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TAgentsMap } from 'librechat-data-provider';
import { useListAgentsQuery } from '~/data-provider';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { mapAgents } from '~/utils';

export default function useAgentsMap({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): TAgentsMap | undefined {
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const { data: mappedAgents = null } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW },
    {
      select: (res) => mapAgents(res.data),
      enabled: isAuthenticated && hasAccess,
    },
  );

  const agentsMap = useMemo<TAgentsMap | undefined>(() => {
    return mappedAgents !== null ? mappedAgents : undefined;
  }, [mappedAgents]);

  return agentsMap;
}
