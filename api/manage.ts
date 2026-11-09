import { productionHandlers } from "../server/handlers.js";
export function GET(request: Request) {
  return productionHandlers().getManage(request);
}
export function POST(request: Request) {
  return productionHandlers().postManage(request);
}
