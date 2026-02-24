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
