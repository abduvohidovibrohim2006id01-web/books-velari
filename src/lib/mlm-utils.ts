import { supabaseAdmin } from "./supabase-admin";

export async function distributeCommissions(orderId: string) {
    console.log(`Distributing commissions for order: ${orderId}`);
    
    // 1. Get order items to find products and their prices
    const { data: order } = await supabaseAdmin
        .from("orders")
        .select("items, status, total, delivery_fee, wallet_amount")
        .eq("id", orderId)
        .single();

    if (!order || order.status !== 'Yetkazildi') {
        console.log("Order not delivered or not found.");
        return;
    }

    // Calculate global discount ratio for the order (if promo code was used)
    let discountRatio = 1;
    if (order.total != null && order.delivery_fee != null && order.items && order.items.length > 0) {
        const originalGoodsTotal = order.items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
        const walletAmt = Number(order.wallet_amount) || 0;
        const finalGoodsTotal = Math.max(0, order.total - order.delivery_fee + walletAmt);
        if (originalGoodsTotal > 0 && finalGoodsTotal < originalGoodsTotal) {
            discountRatio = finalGoodsTotal / originalGoodsTotal;
        }
    }

    // 2. Atomically claim pending transactions (prevents double-processing)
    const { data: transactions } = await supabaseAdmin
        .from("affiliate_transactions")
        .update({ status: 'processing' })
        .eq("order_id", orderId)
        .eq("status", 'pending')
        .select();

    if (!transactions || transactions.length === 0) {
        console.log("No pending transactions (already processed or none exist).");
        return;
    }

    for (const trans of transactions) {
        try {
            // For promo-code rewards or other flat rewards without a specific product,
            // the amount is already calculated and fixed. Just approve it.
            if (!trans.product_id) {
                await supabaseAdmin.from("affiliate_transactions").update({
                    order_stage: 'Yetkazildi',
                    status: 'approved' // Enters the 14-day frozen period
                }).eq("id", trans.id);
                continue;
            }

            // Get product commission settings
            const { data: product } = await supabaseAdmin
                .from("products")
                .select("price, comm_seller, comm_tm, comm_manager")
                .eq("id", trans.product_id)
                .single();

            if (!product) continue;

            // Find the item in the order to get the actual price paid (if discounted)
            const item = order.items.find((i: any) => i.id === trans.product_id);
            const price = item?.price || product.price;
            const quantity = item?.quantity || 1;
            const totalItemPrice = Math.floor((price * quantity) * discountRatio);

            // Get the seller (link owner)
            const { data: seller } = await supabaseAdmin
                .from("users")
                .select("id, affiliate_role, upline_id")
                .eq("id", trans.user_id)
                .single();

            if (!seller) continue;

            // Calculate Seller Commission (always)
            const sellerComm = Math.floor(totalItemPrice * (product.comm_seller || 0) / 100);
            
            // Update the original transaction with amount and set order_stage
            await supabaseAdmin.from("affiliate_transactions").update({
                amount: sellerComm,
                order_stage: 'Yetkazildi',
                status: 'approved' // Now it enters the 14-day frozen period
            }).eq("id", trans.id);

            // HANDLE OVERRIDES (Management Commission)
            if (seller.upline_id) {
                const { data: upline } = await supabaseAdmin
                    .from("users")
                    .select("id, affiliate_role")
                    .eq("id", seller.upline_id)
                    .single();

                if (upline) {
                    let overrideAmount = 0;
                    let overrideRole = "";

                    // If seller is Agent, Upline gets Manager % (if Upline is TSM or SM)
                    if (seller.affiliate_role === 'agent') {
                        overrideAmount = Math.floor(totalItemPrice * (product.comm_manager || 0) / 100);
                        overrideRole = "Manager Override";
                    } 
                    // If seller is SM/TSM, Upline (TM) gets TM %
                    else if (seller.affiliate_role === 'sales_manager' || seller.affiliate_role === 'top_sales_manager') {
                        overrideAmount = Math.floor(totalItemPrice * (product.comm_tm || 0) / 100);
                        overrideRole = "Top Manager Override";
                    }

                    if (overrideAmount > 0) {
                        // Create a new transaction for the manager
                        await supabaseAdmin.from("affiliate_transactions").insert({
                            user_id: upline.id,
                            order_id: orderId,
                            product_id: trans.product_id,
                            status: 'approved',
                            amount: overrideAmount,
                            order_stage: `Rahbarlik haqi (${overrideRole})`
                        });
                    }
                }
            }

        } catch (err) {
            console.error("Error processing transaction commission:", err);
        }
    }
}
