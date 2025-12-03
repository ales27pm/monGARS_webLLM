import { useCallback, useEffect, useState } from "react";
import { monGarsBrain } from "./MonGarsBrainService";
import type { MonGarsBrainSnapshot } from "./MonGarsBrainService";

/**
 * React hook exposing the MonGars brain state and actions
 * to any component tree.
 */
export function useMonGarsBrain() {
  const [snapshot, setSnapshot] = useState<MonGarsBrainSnapshot>(() =>
    monGarsBrain.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = monGarsBrain.subscribe(setSnapshot);
    return unsubscribe;
  }, []);

  const sendUserMessage = useCallback(
    (text: string) => monGarsBrain.sendUserMessage(text),
    [],
  );

  const resetConversation = useCallback(
    () => monGarsBrain.resetConversation(),
    [],
  );

  return {
    ...snapshot,
    sendUserMessage,
    resetConversation,
  };
}
