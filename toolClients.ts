import { PublicClientApplication, type AccountInfo, type AuthenticationResult } from "@azure/msal-browser";

export type ToolSource = { title: string; url: string };

export interface ToolResult {
  content: string;
  sources: ToolSource[];
}

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

export async function callWeatherTool(params: {
  city: string;
  units?: "metric" | "imperial";
}): Promise<ToolResult> {
  const units = params.units ?? "metric";
  if (!OPENWEATHER_API_KEY) {
    return {
      content:
        "La météo n’est pas configurée (clé OPENWEATHER manquante). Ajoute VITE_OPENWEATHER_API_KEY dans ton .env.",
      sources: [],
    };
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("q", params.city);
  url.searchParams.set("appid", OPENWEATHER_API_KEY);
  url.searchParams.set("units", units);
  url.searchParams.set("lang", "fr");

  const res = await fetch(url.toString());
  if (!res.ok) {
    return {
      content: `Impossible de récupérer la météo pour "${params.city}" (code ${res.status}).`,
      sources: [],
    };
  }

  const data = await res.json();
  const main = data.main ?? {};
  const weather0 = (data.weather && data.weather[0]) || {};
  const wind = data.wind ?? {};

  const unitLabel = units === "metric" ? "°C" : "°F";
  const windLabel = units === "metric" ? "m/s" : "mph";

  const parts: string[] = [];
  if (weather0.description) parts.push(`Conditions: ${weather0.description}`);
  if (main.temp != null) parts.push(`Température: ${main.temp}${unitLabel}`);
  if (main.feels_like != null) parts.push(`Ressenti: ${main.feels_like}${unitLabel}`);
  if (main.humidity != null) parts.push(`Humidité: ${main.humidity}%`);
  if (wind.speed != null) parts.push(`Vent: ${wind.speed} ${windLabel}`);

  const city = data.name || params.city;

  return {
    content: `Météo pour ${city}:\n` + parts.join("\n"),
    sources: [
      {
        title: `OpenWeather – ${city}`,
        url: `https://openweathermap.org/find?q=${encodeURIComponent(city)}`,
      },
    ],
  };
}

const loginRequest = {
  scopes: ["User.Read", "Calendars.Read"],
};

let msalInstance: PublicClientApplication | null = null;
let msalConfigKey: string | null = null;

const createMsalConfig = () => {
  if (typeof window === "undefined") {
    throw new Error("MSAL indisponible côté serveur.");
  }

  const clientId = import.meta.env.VITE_MS_CLIENT_ID as string | undefined;
  const authority = import.meta.env.VITE_MS_AUTHORITY || "https://login.microsoftonline.com/common";
  const redirectUri = window.location.origin;

  if (!clientId) {
    throw new Error("MSAL non configuré (VITE_MS_CLIENT_ID manquant). Configure l’app dans Azure AD.");
  }

  return {
    auth: {
      clientId,
      authority,
      redirectUri,
    },
  };
};

const getMsalInstance = (): PublicClientApplication => {
  const config = createMsalConfig();
  const key = `${config.auth.clientId}|${config.auth.authority}|${config.auth.redirectUri}`;

  if (!msalInstance || msalConfigKey !== key) {
    msalInstance = new PublicClientApplication(config);
    msalConfigKey = key;
  }

  return msalInstance;
};

async function getGraphAccessToken(): Promise<string> {
  const client = getMsalInstance();

  let account: AccountInfo | null = client.getActiveAccount() || client.getAllAccounts()[0] || null;

  if (!account) {
    const loginResult: AuthenticationResult = await client.loginPopup(loginRequest);
    account = loginResult.account;
    client.setActiveAccount(account);
  }

  const tokenResult =
    (await client
      .acquireTokenSilent({
        ...loginRequest,
        account,
      })
      .catch(() => client.acquireTokenPopup(loginRequest))) as AuthenticationResult;

  return tokenResult.accessToken;
}

export async function callOutlookEventsTool(params: { days_ahead: number }): Promise<ToolResult> {
  try {
    const token = await getGraphAccessToken();
    const now = new Date();
    const end = new Date(now.getTime() + params.days_ahead * 86400000);

    const startStr = now.toISOString();
    const endStr = end.toISOString();

    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
    url.searchParams.set("startDateTime", startStr);
    url.searchParams.set("endDateTime", endStr);
    url.searchParams.set("$top", "10");
    url.searchParams.set("$orderby", "start/dateTime");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        content: `Erreur Outlook/Graph (${res.status}): ${text}`,
        sources: [],
      };
    }

    const data = await res.json();
    const events = Array.isArray(data.value) ? data.value : [];

    if (!events.length) {
      return {
        content: "Aucun événement Outlook trouvé dans la période demandée.",
        sources: [],
      };
    }

    const lines: string[] = [];
    const sources: ToolSource[] = [];
    for (const ev of events) {
      const subject = ev.subject || "(Sans sujet)";
      const start = ev.start?.dateTime;
      const endDt = ev.end?.dateTime;
      const location = ev.location?.displayName || "";
      let line = `- ${subject}`;
      if (start && endDt) line += ` — ${start} → ${endDt}`;
      if (location) line += ` @ ${location}`;
      lines.push(line);

      if (ev.webLink) {
        sources.push({ title: subject, url: ev.webLink });
      }
    }

    return {
      content: "Événements Outlook à venir:\n" + lines.join("\n"),
      sources,
    };
  } catch (err: any) {
    return {
      content: "Impossible d’accéder au calendrier Outlook. Vérifie la connexion et les permissions MSAL.",
      sources: [],
    };
  }
}

declare global {
  interface Window {
    FB: any;
    fbAsyncInit?: () => void;
  }
}

export function initFacebookSdk(appId: string) {
  if (window.FB) return;

  window.fbAsyncInit = function () {
    window.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: "v19.0",
    });
  };

  const id = "facebook-jssdk";
  if (document.getElementById(id)) return;

  const js = document.createElement("script");
  js.id = id;
  js.src = "https://connect.facebook.net/en_US/sdk.js";
  const fjs = document.getElementsByTagName("script")[0];
  fjs.parentNode?.insertBefore(js, fjs);
}

let facebookLoginPromise: Promise<void> | null = null;
let facebookLoggedIn = false;

async function ensureFacebookLogin(scopes = "public_profile") {
  if (facebookLoggedIn) return;
  if (facebookLoginPromise) return facebookLoginPromise;

  facebookLoginPromise = new Promise<void>((resolve, reject) => {
    window.FB.getLoginStatus((response: any) => {
      if (response.status === "connected") {
        facebookLoggedIn = true;
        resolve();
      } else {
        window.FB.login(
          (resp: any) => {
            if (resp.authResponse) {
              facebookLoggedIn = true;
              resolve();
            } else {
              facebookLoginPromise = null;
              reject(new Error("Facebook login cancelled."));
            }
          },
          { scope: scopes },
        );
      }
    });
  });

  return facebookLoginPromise.finally(() => {
    if (!facebookLoggedIn) {
      facebookLoginPromise = null;
    }
  });
}

export async function callFacebookPagePostsTool(params: { page_id: string; limit?: number }): Promise<ToolResult> {
  const limit = params.limit ?? 5;

  if (!window.FB) {
    return {
      content: "Le SDK Facebook n’est pas initialisé. Appelle initFacebookSdk(appId) au démarrage de l’app.",
      sources: [],
    };
  }

  try {
    await ensureFacebookLogin("public_profile,pages_read_engagement");
  } catch (err) {
    console.error("Facebook login error:", err);
    return {
      content:
        "Connexion à Facebook annulée ou impossible. Je ne peux pas récupérer les posts de la page.",
      sources: [],
    };
  }

  const posts = await new Promise<any[]>((resolve, reject) => {
    window.FB.api(
      `/${encodeURIComponent(params.page_id)}/posts`,
      "GET",
      { fields: "message,created_time,permalink_url", limit },
      (response: any) => {
        if (!response || response.error) {
          reject(new Error(response?.error?.message || "Erreur Graph API Facebook"));
        } else {
          resolve(response.data || []);
        }
      },
    );
  }).catch((err) => {
    console.error("Facebook API error:", err);
    return [] as any[];
  });

  if (!posts.length) {
    return {
      content: `Aucun post récent pour la page Facebook "${params.page_id}".`,
      sources: [],
    };
  }

  const lines: string[] = [];
  const sources: ToolSource[] = [];
  for (const p of posts) {
    const msg: string = p.message || "(Aucun texte)";
    const created: string = p.created_time || "";
    const link: string | undefined = p.permalink_url;
    lines.push(`- [${created}] ${msg.slice(0, 260)}`);
    if (link) {
      sources.push({ title: msg.slice(0, 60) || "(post)", url: link });
    }
  }

  return {
    content: `Posts Facebook récents pour ${params.page_id}:\n` + lines.join("\n"),
    sources,
  };
}

export async function callScrapeTool(params: { url: string; max_chars?: number }): Promise<ToolResult> {
  const maxChars = params.max_chars ?? 4000;

  try {
    const res = await fetch(params.url, { mode: "cors" });
    if (!res.ok) {
      return {
        content: `Impossible de récupérer ${params.url} (HTTP ${res.status}).`,
        sources: [],
      };
    }

    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
    const text = doc.body?.textContent || "";

    if (!text.trim()) {
      return {
        content:
          "Le contenu texte est vide ou non accessible (peut-être protégé par CORS ou rendu côté client).",
        sources: [],
      };
    }

    const truncated =
      text.length > maxChars
        ? text.slice(0, maxChars) + "\n\n[Texte tronqué pour respecter la limite.]"
        : text;

    return {
      content: `Contenu extrait de ${params.url}:\n\n${truncated}`,
      sources: [{ title: params.url, url: params.url }],
    };
  } catch (err: any) {
    return {
      content:
        "Impossible de scraper cette URL depuis le navigateur (CORS ou autre restriction). Sans backend/proxy, je ne peux pas aller plus loin.",
      sources: [{ title: params.url, url: params.url }],
    };
  }
}
