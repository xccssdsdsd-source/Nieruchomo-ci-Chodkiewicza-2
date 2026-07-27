const isLocalHost = (hostname: string): boolean =>
	hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const parseExactOrigin = (configured: string, label: string): string => {
	const url = new URL(configured);
	if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
		throw new Error(`${label} musi zawierać wyłącznie origin, np. https://panel.example.com.`);
	}
	if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
		throw new Error(`${label} musi używać HTTPS poza środowiskiem lokalnym.`);
	}
	return url.origin;
};

// Authentication and CSRF trust must come from deployment configuration, not
// from the attacker-influenced Host header. Production deliberately fails
// closed when APP_ORIGIN is missing or malformed.
export const getAppOrigin = (env: Env, requestUrl: string): string => {
	const request = new URL(requestUrl);
	const configured = env.APP_ORIGIN?.trim();

	if (!configured) {
		if (isLocalHost(request.hostname)) return request.origin;
		throw new Error('Brak wymaganego sekretu APP_ORIGIN.');
	}

	return parseExactOrigin(configured, 'APP_ORIGIN');
};

// Public CORS is allowlisted by deployment configuration. A copied project
// therefore fails closed instead of silently exposing billable/public APIs to
// every website on the Internet.
export const getPublicSiteOrigin = (env: Env, requestUrl: string): string => {
	const request = new URL(requestUrl);
	const configured = env.PUBLIC_SITE_ORIGIN?.trim();
	if (!configured) {
		if (isLocalHost(request.hostname)) return request.origin;
		throw new Error('Brak wymaganej konfiguracji PUBLIC_SITE_ORIGIN.');
	}
	return parseExactOrigin(configured, 'PUBLIC_SITE_ORIGIN');
};
