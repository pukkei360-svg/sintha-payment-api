export const config = { runtime: 'edge' };
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
async function verifyFirebaseToken(token, projectId) {
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
  return payload;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
function base64Encode(str) {
  if (typeof btoa === 'function') return btoa(str);
  return Buffer.from(str).toString('base64');
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
    if (!match) return json({ error: "unauthenticated" }, 401);
    const payload = await verifyFirebaseToken(match[1], projectId);
    uid = payload.sub;
  } catch (e) { return json({ error: "unauthenticated", detail: e.message }, 401); }
  try {
    const body = await request.text();
    let amount, description;
    try {
      const parsed = JSON.parse(body);
      amount = parsed.amount;
      description = parsed.description || "SINTHA PRO Subscription";
    } catch (e) { return json({ error: "invalid_json" }, 400); }
    const amountRupees = Number(amount);
    if (!amountRupees || amountRupees <= 0) return json({ error: "invalid_amount" }, 400);
    const authB64 = base64Encode(`${keyId}:${keySecret}`);
    // Create a Payment Link — Razorpay hosts the payment page on rzp.io.
    // No domain approval needed, no 406 possible.
    // The payment link automatically creates an order internally.
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Basic ${authB64}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        currency: "INR",
        reference_id: `sintha_${uid}_${Date.now()}`,
        description: description,
        notes: { uid, source: "android_app" },
        // No callback_url — user presses Back after payment, app polls for status.
        notify: { email: false, sms: false },
        reminder_enable: false,
      }),
    });
    const linkText = await res.text();
    console.log("Razorpay payment link response:", res.status, linkText);
    if (!res.ok) {
      let errMsg = `Razorpay error ${res.status}`;
      try { errMsg = JSON.parse(linkText)?.error?.description || errMsg; } catch (_) {}
      return json({ error: errMsg }, 500);
    }
    let link;
    try { link = JSON.parse(linkText); } catch (e) { return json({ error: "razorpay_invalid_response" }, 500); }
    // Return the short_url (hosted on rzp.io) + order_id for polling.
    return json({
      shortUrl: link.short_url,
      paymentLinkId: link.id,
      orderId: link.order_id || null,
      amount: link.amount,
    });
  } catch (e) { console.error("Server error:", e); return json({ error: e.message || "internal_error" }, 500); }
}
