/**
 * Format error message for user
 */
export function formatErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "An unexpected error occurred";
}

type TZFmtResult = { success: true; time: string } | { success: false };

export function formatInTz(
	d: Date,
	timeZone: string,
	locale = "fi-FI",
): TZFmtResult {
	try {
		const result = new Intl.DateTimeFormat(locale, {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
			timeZoneName: "short",
		}).format(d);

		return {
			success: true,
			time: result,
		};
	} catch (e: unknown) {
		console.error(`[TZ ERROR]: ${formatErrorMessage(e)}`);
		return {
			success: false,
		};
	}
}

/**
 * Executes a database query function and retries it if it throws an error.
 * Useful for handling transient D1 database lock contentions (SQLITE_BUSY).
 *
 * @param fn - The database query execution function returning a Promise.
 * @param retries - Number of retry attempts. Defaults to 3.
 * @param delayMs - Delay between retries in milliseconds. Defaults to 100.
 */
export async function withDbRetry<T>(
	fn: () => Promise<T>,
	retries = 3,
	delayMs = 100,
): Promise<T> {
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (err) {
			if (i === retries - 1) throw err;
			console.warn(
				`[DB RETRY] Query failed, retrying in ${delayMs}ms. Error: ${formatErrorMessage(err)}`,
			);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw new Error("DB Retry failed");
}
