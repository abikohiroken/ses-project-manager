import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    APP_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url(),
    AUTH_TRUST_HOST: optionalString,
    GOOGLE_PROJECT_ID: optionalString,
    GOOGLE_CLIENT_EMAIL: optionalString,
    GOOGLE_PRIVATE_KEY: optionalString,
    GOOGLE_SHEETS_SPREADSHEET_ID: optionalString,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalString,
    GOOGLE_DRIVE_INBOX_FOLDER_ID: optionalString,
    GOOGLE_DRIVE_PROCESSED_FOLDER_ID: optionalString,
    GOOGLE_DRIVE_ERROR_FOLDER_ID: optionalString,
    LINE_CHANNEL_SECRET: optionalString,
    LINE_CHANNEL_ACCESS_TOKEN: optionalString,
    CRON_SECRET: optionalString,
    INITIAL_ADMIN_EMAIL: optionalString,
    INITIAL_ADMIN_NAME: optionalString,
  })
  .refine((value) => value.NEXTAUTH_URL === value.APP_URL, {
    message: "NEXTAUTH_URL must match APP_URL",
    path: ["NEXTAUTH_URL"],
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
