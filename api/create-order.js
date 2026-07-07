export const config = { runtime: 'edge' };
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

async function verifyFirebaseToken(token, projectId) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  return payload;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
  });
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const projectId = process.env.FIREBASE_PROJECT_ID || "sintha-2999b";
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return json({ error: "server_not_configured" }, 500);

  let uid;
  try {
    const auth = request.headers.get("Authorization") || "";
    const match = auth.match(/^Bearer (.+)$/);
    if (!match) throw new Error("missing_token");
    const payload = await verifyFirebaseToken(match[1], projectId);
    uid = payload.sub;
  } catch (e) { return json({ error: "unauthenticated" }, 401); }

  try {
    const { amount } = await request.json();
    const amountRupees = Number(amount);
    if (!amountRupees || amountRupees <= 0) return json({ error: "invalid_amount" }, 400);
    const authB64 = btoa(`${keyId}:${keySecret}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${authB64}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        currency: "INR",
        receipt: `receipt_${uid}_${Date.now()}`,
        payment_capture: 1,
        notes: { uid },
      }),
    });
    const order = await res.json();
    if (!res.ok) throw new Error(order?.error?.description || `Razorpay error ${res.status}`);
    return json({ orderId: order.id });
  } catch (e) { console.error(e); return json({ error: e.message || "internal_error" }, 500); }
}
