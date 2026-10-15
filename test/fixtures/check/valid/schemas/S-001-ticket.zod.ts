// GENERATED FROM S-001-ticket.schema.json BY ITE 0.1.0 - DO NOT EDIT. Re-run compile.
import { z } from "zod";

export const TicketSchema = z.object({
  summary: z.string().max(120),
  priority: z.enum(["low", "high"]),
}).strict().describe("Ticket sent to Jira. Used by R-002.");
export type Ticket = z.infer<typeof TicketSchema>;
