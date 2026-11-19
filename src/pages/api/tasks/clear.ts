import { onRequestDelete } from "../../../../functions/api/tasks/clear";
import { createNextApiHandler } from "@/lib/server/nextApiAdapter";

export const config = { api: { bodyParser: false } };

export default createNextApiHandler({ DELETE: onRequestDelete });
