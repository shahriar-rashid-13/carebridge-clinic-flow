import * as Sentry from "@sentry/tanstackstart-react";
import type { AnyRouter } from "@tanstack/react-router";

// The app handles health data, so events are scrubbed before they leave the browser:
// no user identity, request bodies, cookies, query strings, console output, or typed text.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(UUID, "[id]").replace(PHONE, "[phone]");
}

const stripQuery = (url: string) => url.split("?")[0] ?? url;

export function scrubEvent<T extends Sentry.Event>(event: T): T {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.transaction) event.transaction = scrubText(event.transaction);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === "console" || breadcrumb.category?.startsWith("ui.input")) return null;
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) {
    const { url, method, status_code } = breadcrumb.data as Record<string, unknown>;
    breadcrumb.data = {
      ...(typeof url === "string" ? { url: scrubText(stripQuery(url)) } : {}),
      ...(method ? { method } : {}),
      ...(status_code ? { status_code } : {}),
    };
  }
  return breadcrumb;
}

let started = false;

export function initSentry(router: AnyRouter) {
  const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
  if (started || !dsn || typeof window === "undefined") return;
  started = true;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  Sentry.setTag("runtime", "browser");

  // Opening any page with ?sentry_test=1 sends one test event to confirm the setup.
  if (new URLSearchParams(window.location.search).has("sentry_test")) {
    Sentry.captureException(new Error("CareBridge Sentry test error (browser)"));
  }
}

export const captureError = (error: unknown, context?: Record<string, string>) =>
  Sentry.captureException(error, context ? { tags: context } : undefined);
