"use client";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./config";
import { useSession } from "./store";

let orders: Socket | null = null;

/** /orders namespace: order:status + tracking:location for orders the user may see. */
export function ordersSocket(trackToken?: string) {
  if (trackToken) {
    return io(`${API_BASE}/orders`, { auth: { trackToken }, extraHeaders: { "ngrok-skip-browser-warning": "true" }, transports: ["websocket", "polling"] });
  }
  if (orders) return orders;
  orders = io(`${API_BASE}/orders`, {
    auth: (cb) => cb({ token: useSession.getState().accessToken }),
    extraHeaders: { "ngrok-skip-browser-warning": "true" },
    transports: ["websocket", "polling"],
  });
  return orders;
}
