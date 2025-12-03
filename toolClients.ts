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
    return fetchOpenMeteoWeather(params.city, units);
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

const openMeteoWeatherCode: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Peu nuageux",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine modérée",
  55: "Bruine dense",
  56: "Bruine verglaçante légère",
  57: "Bruine verglaçante dense",
  61: "Pluie faible",
  63: "Pluie modérée",
  65: "Pluie forte",
  66: "Pluie verglaçante légère",
  67: "Pluie verglaçante forte",
  71: "Neige faible",
  73: "Neige modérée",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses de pluie faibles",
  81: "Averses de pluie modérées",
  82: "Averses de pluie violentes",
  85: "Averses de neige faibles",
  86: "Averses de neige fortes",
  95: "Orage",
  96: "Orage avec grésil",
  99: "Orage fort avec grésil",
};

async function fetchOpenMeteoWeather(city: string, units: "metric" | "imperial"): Promise<ToolResult> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "fr");
  geoUrl.searchParams.set("format", "json");

  let geoData: unknown;
  try {
    const geoRes = await fetch(geoUrl.toString());
    if (!geoRes.ok) {
      return {
        content: `Géocodage Open-Meteo indisponible pour "${city}" (code ${geoRes.status}).`,
        sources: [],
      };
    }

    geoData = await geoRes.json();
  } catch (error) {
    return {
      content: `Erreur lors de l'appel au géocodeur Open-Meteo pour "${city}": ${String(error)}`,
      sources: [],
    };
  }

  const result = Array.isArray((geoData as { results?: unknown }).results)
    ? (geoData as { results: any[] }).results[0]
    : null;
  const latitude = Number(result?.latitude);
  const longitude = Number(result?.longitude);
  const name = typeof result?.name === "string" ? result.name : undefined;
  const admin1 = typeof result?.admin1 === "string" ? result.admin1 : undefined;
  const country = typeof result?.country === "string" ? result.country : undefined;

  if (!result || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return {
      content: `Impossible de localiser "${city}" via Open-Meteo.`,
      sources: [],
    };
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code",
  );
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("language", "fr");
  if (units === "metric") {
    forecastUrl.searchParams.set("wind_speed_unit", "ms");
  }
  if (units === "imperial") {
    forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
    forecastUrl.searchParams.set("wind_speed_unit", "mph");
  }

  let forecastData: any;
  try {
    const forecastRes = await fetch(forecastUrl.toString());
    if (!forecastRes.ok) {
      return {
        content: `Météo Open-Meteo indisponible pour "${city}" (code ${forecastRes.status}).`,
        sources: [],
      };
    }

    forecastData = await forecastRes.json();
  } catch (error) {
    return {
      content: `Erreur lors de la récupération de la météo Open-Meteo pour "${city}": ${String(error)}`,
      sources: [],
    };
  }

  const current = forecastData.current || {};
  const unitLabel = units === "metric" ? "°C" : "°F";
  const windLabel = units === "metric" ? "m/s" : "mph";

  const rawWeatherCode = Array.isArray(current.weather_code)
    ? current.weather_code[0]
    : current.weather_code;
  const normalizedCode = typeof rawWeatherCode === "number" ? rawWeatherCode : Number(rawWeatherCode);
  const description = normalizedCode in openMeteoWeatherCode ? openMeteoWeatherCode[normalizedCode] : null;
  const parts: string[] = [];
  if (description) {
    parts.push(`Conditions: ${description}`);
  } else if (rawWeatherCode != null) {
    parts.push(`Conditions: Code météo ${rawWeatherCode} non reconnu`);
  }
  if (current.temperature_2m != null) parts.push(`Température: ${current.temperature_2m}${unitLabel}`);
  if (current.apparent_temperature != null)
    parts.push(`Ressenti: ${current.apparent_temperature}${unitLabel}`);
  if (current.relative_humidity_2m != null) parts.push(`Humidité: ${current.relative_humidity_2m}%`);
  if (current.wind_speed_10m != null) parts.push(`Vent: ${current.wind_speed_10m} ${windLabel}`);
  if (current.wind_direction_10m != null) parts.push(`Direction du vent: ${current.wind_direction_10m}°`);

  const locationLabel = [name, admin1, country].filter(Boolean).join(", ");
  const displayName = locationLabel || city;

  return {
    content: `Météo (Open-Meteo) pour ${displayName}:\n` + parts.join("\n"),
    sources: [
      {
        title: `Open-Meteo – ${displayName}`,
        url: forecastUrl.toString(),
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
