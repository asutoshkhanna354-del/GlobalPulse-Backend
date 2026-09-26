import { Router } from "express";
import { requireAuth } from "../lib/authMiddleware";

const router = Router();

router.post("/checkout/whop-stripe", requireAuth, async (req, res) => {
  try {
    const { planName, billingCycle } = req.body;
    
    // Whop Checkout Links are typically generated in the Whop Dashboard.
    // Instead of creating sessions via API (which Whop doesn't fully support for dynamic payment links),
    // you should create Checkout Links in your Whop Dashboard and paste the URLs here in your .env file.
    
    const whopLinks: Record<string, string | undefined> = {
      "plus_monthly": process.env.WHOP_LINK_PLUS_MONTHLY,
      "plus_yearly": process.env.WHOP_LINK_PLUS_YEARLY,
      "pro_monthly": process.env.WHOP_LINK_PRO_MONTHLY,
      "pro_yearly": process.env.WHOP_LINK_PRO_YEARLY,
    };

    const planKey = `${planName}_${billingCycle}`;
    const checkoutUrl = whopLinks[planKey];

    if (!checkoutUrl) {
      return res.status(500).json({ 
        error: `Checkout link for ${planName} (${billingCycle}) is not configured. Please add WHOP_LINK_${planName.toUpperCase()}_${billingCycle.toUpperCase()} to your .env file.` 
      });
    }

    // Pass email as a query parameter if Whop supports pre-filling
    const finalUrl = new URL(checkoutUrl);
    if (req.authUser?.email) {
      finalUrl.searchParams.append('email', req.authUser.email);
    }

    res.json({ url: finalUrl.toString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Internal Server Error during Whop Checkout" });
  }
});

export default router;
