/** True when running inside the Rosier People Android app (see capacitor.config.ts appendUserAgent). */
export const isAndroidApp = () => typeof navigator !== "undefined" && navigator.userAgent.includes("RosierPeopleApp/Android");
