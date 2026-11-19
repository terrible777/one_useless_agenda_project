import { onRequestPost } from "../../../functions/api/course-requirements";
import { createNextApiHandler } from "@/lib/server/nextApiAdapter";

export const config = { api: { bodyParser: false } };
export const maxDuration = 60;

export default createNextApiHandler({ POST: onRequestPost });
