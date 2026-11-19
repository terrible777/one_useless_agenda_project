import { onRequestPost } from "../../../functions/api/analyze";
import { createNextApiHandler } from "@/lib/server/nextApiAdapter";

export const config = { api: { bodyParser: false } };
export const maxDuration = 60;

export default createNextApiHandler({ POST: onRequestPost });
