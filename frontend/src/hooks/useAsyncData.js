import { useCallback, useEffect, useState } from "react";

export function useAsyncData(loader, params) {
  const paramsKey = JSON.stringify(params ?? null);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState({
    data: undefined,
    error: null,
    requestKey: null,
  });
  const requestKey = `${paramsKey}:${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const requestParams = JSON.parse(paramsKey);

    Promise.resolve()
      .then(() => loader(requestParams, { signal: controller.signal }))
      .then((data) => {
        if (active) setState({ data, error: null, requestKey });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState((current) => ({ ...current, error, requestKey }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [loader, paramsKey, reloadToken, requestKey]);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  const isCurrentRequest = state.requestKey === requestKey;
  return {
    data: state.data,
    isLoading: !isCurrentRequest,
    error: isCurrentRequest ? state.error : null,
    reload,
  };
}
