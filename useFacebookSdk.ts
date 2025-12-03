import { useEffect } from "react";
import { initFacebookSdk } from "./toolClients";

export const useFacebookSdk = (appId?: string) => {
  useEffect(() => {
    if (!appId) return;
    initFacebookSdk(appId);
  }, [appId]);
};
