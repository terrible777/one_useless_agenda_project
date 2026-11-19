import { onRequestGet, onRequestPost, onRequestDelete } from "../../../functions/api/requirements";
import { createNextApiHandler } from "@/lib/server/nextApiAdapter";

export const config = { api: { bodyParser: false } };

export default createNextApiHandler({
  GET: onRequestGet,
  POST: onRequestPost,
  DELETE: onRequestDelete,
});
