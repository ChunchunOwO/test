export const touchRetainedRoute = <RouteId extends string>(
  current: readonly RouteId[],
  routeId: RouteId,
  limit: number,
): RouteId[] => {
  if (limit <= 0) {
    return [];
  }

  return [...current.filter((currentId) => currentId !== routeId), routeId].slice(-limit);
};

export const resolveRetainedRouteLru = <RouteId extends string>({
  activeRouteId,
  current,
  maxMountedRoutes,
  persistentRouteIds,
  preservedRouteId = null,
}: {
  activeRouteId: RouteId;
  current: readonly RouteId[];
  maxMountedRoutes: number;
  persistentRouteIds: ReadonlySet<RouteId>;
  preservedRouteId?: RouteId | null;
}): RouteId[] => {
  const activeIsRetained = persistentRouteIds.has(activeRouteId);
  const retainedLimit = Math.max(0, maxMountedRoutes - (activeIsRetained ? 0 : 1));
  if (retainedLimit === 0) {
    return [];
  }

  const allowedRouteIds = new Set<RouteId>(persistentRouteIds);
  if (preservedRouteId) {
    allowedRouteIds.add(preservedRouteId);
  }

  let next = current.filter((routeId) => allowedRouteIds.has(routeId));
  if (preservedRouteId) {
    next = touchRetainedRoute(next, preservedRouteId, retainedLimit);
  }
  if (activeIsRetained) {
    next = touchRetainedRoute(next, activeRouteId, retainedLimit);
  }

  return next.slice(-retainedLimit);
};
