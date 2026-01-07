/**
 * Format a mention for a user. Prefers @username if available,
 * otherwise falls back to HTML text_mention using tg://user?id=
 */
export function formatMention(
	userId: number | bigint,
	username?: string | null,
	firstName?: string | null,
): string {
	if (username) {
		return `@${username}`;
	}
	const name = firstName || `User ${userId}`;
	// For Telegram bots sending HTML, use HTML mention
	return `<a href="tg://user?id=${userId}">${name}</a>`;
}

/**
 * Escape HTML for Telegram messages
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
