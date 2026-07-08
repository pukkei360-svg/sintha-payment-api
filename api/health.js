export const config = { runtime: 'edge' };
export default async function handler(request) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  return new Response(JSON.stringify({
    status: "ok",
    configured: !!(keyId && keySecret && projectId),
    hasKeyId: !!keyId,
    hasKeySecret: !!keySecret,
    hasProjectId: !!projectId,
    projectId: projectId || "not set",
  }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
