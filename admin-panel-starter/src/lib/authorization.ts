export const isConfiguredAdmin = (sessionEmail: string, configuredEmail: string | undefined): boolean => {
	const allowed = configuredEmail?.trim().toLowerCase();
	return Boolean(allowed) && sessionEmail.trim().toLowerCase() === allowed;
};
