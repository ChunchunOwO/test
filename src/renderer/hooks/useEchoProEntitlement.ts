import { useCallback, useEffect, useState } from 'react';

type EchoProEntitlementState = {
  unlocked: boolean;
  checked: boolean;
};

export const useEchoProEntitlement = (): EchoProEntitlementState => {
  const [state, setState] = useState<EchoProEntitlementState>({ unlocked: false, checked: false });

  const refresh = useCallback((): void => {
    const getStatus = window.echo?.app?.getEchoProLocalEntitlementStatus;
    if (!getStatus) {
      return;
    }

    void getStatus()
      .then((status) => setState({ unlocked: status.unlocked === true, checked: true }))
      .catch(() => setState({ unlocked: false, checked: true }));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('echo-pro:status-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('echo-pro:status-changed', refresh);
    };
  }, [refresh]);

  return state;
};
