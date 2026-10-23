import crypto from "crypto";

/**
 * Click Merchant API v2 implementation
 * Handles refunds (reversals) and payment status checks
 */
export class ClickAPI {
    private static serviceId = process.env.NEXT_PUBLIC_CLICK_SERVICE_ID || "";
    private static merchantId = process.env.NEXT_PUBLIC_CLICK_MERCHANT_ID || "";
    private static secretKey = process.env.CLICK_SECRET_KEY || "";
    
    // Note: Reversal API requires special Merchant API credentials (Login/Password)
    // You should add these to your .env.local after consulting Click support
    private static merchantUser = process.env.CLICK_MERCHANT_USER || "";
    private static merchantPassword = process.env.CLICK_MERCHANT_PASSWORD || "";

    /**
     * Reverses (Refunds) a successful payment
     */
    static async reversePayment(clickTransId: string, orderId: string) {
        if (!this.merchantUser || !this.merchantPassword) {
            console.error("Click Merchant API credentials (USER/PASSWORD) are missing in .env");
            return { success: false, error: "Merchant API not configured" };
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const digest = crypto.createHash('sha1').update(timestamp + this.merchantPassword).digest('hex');
        const authHeader = `ClickMerchant ${this.merchantUser}:${digest}:${timestamp}`;

        try {
            const response = await fetch("https://api.click.uz/v2/merchant/payment/reversal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Auth": authHeader
                },
                body: JSON.stringify({
                    service_id: parseInt(this.serviceId),
                    click_trans_id: parseInt(clickTransId),
                    merchant_trans_id: orderId
                })
            });

            const data = await response.json();
            
            if (data.error === "0") {
                return { success: true, data };
            } else {
                return { success: false, error: data.error_note || "Click error" };
            }
        } catch (error: any) {
            console.error("Click Reversal API Error:", error);
            return { success: false, error: error.message };
        }
    }
}
