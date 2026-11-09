import { productionHandlers } from "../server/handlers.js";
export function GET(request: Request) {
  return productionHandlers().getCatalog(request);
}
