import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendOrderNotification } from "@/lib/telegram";
import { normalizeOrderStatus } from "@/lib/order-status";

// POST URL for both Prepare and Complete
export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        
        // Extract fields
        const click_trans_id = formData.get("click_trans_id") as string;
        const service_id = formData.get("service_id") as string;
        const click_paydoc_id = formData.get("click_paydoc_id") as string;
        const merchant_trans_id = formData.get("merchant_trans_id") as string;
        const merchant_prepare_id = formData.get("merchant_prepare_id") as string;
        const amount = formData.get("amount") as string;
        const action = formData.get("action") as string;
        const error = formData.get("error") as string;
        const error_note = formData.get("error_note") as string;
        const sign_time = formData.get("sign_time") as string;
        const sign_string = formData.get("sign_string") as string;

        const SECRET_KEY = process.env.CLICK_SECRET_KEY || "";

        // Verify Signature
        let signStringTarget = "";
        if (action === "0") {
            // Prepare
            signStringTarget = `${click_trans_id}${service_id}${SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`;
        } else if (action === "1") {
            // Complete
            signStringTarget = `${click_trans_id}${service_id}${SECRET_KEY}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`;
        }

        const mySignString = crypto.createHash("md5").update(signStringTarget).digest("hex");

        if (mySignString !== sign_string) {
            return NextResponse.json({ error: -1, error_note: "SIGN CHECK FAILED" });
        }

        // Reject requests with sign_time older than 10 minutes to prevent replay attacks
        // sign_time format from Click: "YYYY-MM-DD HH:MM:SS"
        const signDate = new Date(sign_time.replace(" ", "T") + "Z");
        if (isNaN(signDate.getTime()) || Date.now() - signDate.getTime() > 10 * 60 * 1000) {
            return NextResponse.json({ error: -1, error_note: "SIGN TIME EXPIRED" });
        }

        const numericAmount = parseFloat(amount || "0");
        const actionNum = parseInt(action || "0");

        // Prepare Process
        if (actionNum === 0) {
            // Check if Order exists
            const { data: order, error: orderError } = await supabaseAdmin
                .from("orders")
                .select("id, total, status")
                .eq("id", merchant_trans_id)
                .single();

            if (orderError || !order) {
                return NextResponse.json({ error: -5, error_note: "ORDER NOT FOUND" });
            }

            // Check if amount is correct
            if (parseFloat(order.total) !== numericAmount) {
                return NextResponse.json({ error: -2, error_note: "INCORRECT AMOUNT" });
            }

            // Check if payment is already paid or cancelled
            const normStatus = normalizeOrderStatus(order.status);
            if (normStatus === "paid" || normStatus === "delivered") {
                return NextResponse.json({ error: -4, error_note: "ALREADY PAID" });
            }
            if (normStatus === "cancelled") {
                return NextResponse.json({ error: -9, error_note: "ORDER CANCELLED" });
            }

            // Check for previous prepared transactions (duplicate check)
            const { data: existingTransaction } = await supabaseAdmin
                .from("click_transactions")
                .select("*")
                .eq("click_trans_id", click_trans_id)
                .single();

            let prepareId;

            if (existingTransaction) {
                prepareId = existingTransaction.id.toString();
            } else {
                // Register transaction
                const { data: newTx, error: txError } = await supabaseAdmin
                    .from("click_transactions")
                    .insert({
                        click_trans_id,
                        click_paydoc_id,
                        order_id: merchant_trans_id,
                        amount: numericAmount,
                        action: actionNum,
                        sign_time,
                        sign_string,
                        status: "prepared"
                    })
                    .select("id")
                    .single();

                if (txError) {
                    return NextResponse.json({ error: -8, error_note: "TRANSACTION CREATION FAILED" });
                }
                prepareId = newTx.id.toString();
            }

            return NextResponse.json({
                click_trans_id: click_trans_id,
                merchant_trans_id: merchant_trans_id,
                merchant_prepare_id: prepareId,
                error: 0,
                error_note: "Success"
            });
        }

        // Complete Process
        if (actionNum === 1) {
            const { data: transaction } = await supabaseAdmin
                .from("click_transactions")
                .select("*")
                .eq("click_trans_id", click_trans_id)
                .single();

            if (!transaction) {
                return NextResponse.json({ error: -6, error_note: "TRANSACTION NOT FOUND" });
            }

            // If error from Click < 0, it means payment failed on their side
            if (parseInt(error) < 0) {
                await supabaseAdmin
                    .from("click_transactions")
                    .update({ status: "cancelled", error: parseInt(error), error_note })
                    .eq("id", transaction.id);
                return NextResponse.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_confirm_id: transaction.id.toString(),
                    error: 0,
                    error_note: "Cancel Success"
                });
            }

            // If already complete, return success to avoid double complete errors
            if (transaction.status === "completed") {
                return NextResponse.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_confirm_id: transaction.id.toString(),
                    error: 0,
                    error_note: "ALREADY COMPLETED"
                });
            }

            // Update Transaction
            await supabaseAdmin
                .from("click_transactions")
                .update({ status: "completed", action: actionNum })
                .eq("id", transaction.id);

            // Update Order
            await supabaseAdmin
                .from("orders")
                .update({ status: "paid" })
                .eq("id", merchant_trans_id);

            // Send Telegram Notification
            await sendOrderNotification(merchant_trans_id, 'click');

            return NextResponse.json({
                click_trans_id,
                merchant_trans_id,
                merchant_confirm_id: transaction.id.toString(),
                error: 0,
                error_note: "Success"
            });
        }

        return NextResponse.json({ error: -3, error_note: "UNKNOWN ACTION" });

    } catch (e: any) {
        console.error("Click API Error:", e);
        return NextResponse.json({ error: -8, error_note: "INTERNAL SERVER ERROR" });
    }
}
