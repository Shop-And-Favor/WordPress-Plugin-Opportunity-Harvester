import { z } from "zod";

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(20).optional(),
  DB_SECRET_ARN: z.string().min(20).optional(),
  OPENROUTER_SECRET_ARN: z.string().min(20).optional(),
  AWS_REGION: z.string().default("eu-west-2"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DATABASE_URL: z.string().optional(),
  APP_USER_AGENT: z
    .string()
    .default("WP-Opportunity-Harvester/1.0 (respectful crawler)"),
});

export function getEnv() {
  return envSchema.parse(process.env);
}
