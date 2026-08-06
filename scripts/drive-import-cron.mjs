const appUrl = process.env.APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!appUrl || !cronSecret) {
  console.error("drive-import: APP_URL or CRON_SECRET is not configured");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(new URL("/api/internal/google-drive-import", appUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await response.text();
    let summary = body;
    try {
      const parsed = JSON.parse(body);
      summary = JSON.stringify({
        processedFiles: parsed.processedFiles,
        successFiles: parsed.successFiles,
        partialSuccessFiles: parsed.partialSuccessFiles,
        errorFiles: parsed.errorFiles,
        skippedFiles: parsed.skippedFiles,
        movePendingFiles: parsed.movePendingFiles,
      });
    } catch {
      summary = `HTTP ${response.status}`;
    }
    console.log(`drive-import: ${summary}`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error(
      `drive-import: request failed (${error instanceof Error ? error.name : "UnknownError"})`,
    );
    process.exitCode = 1;
  }
}
