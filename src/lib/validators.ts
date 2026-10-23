import { z } from 'zod';

/**
 * Validator for Admin/User Authentication
 */
export const authSchema = z.object({
    step: z.enum(['password', '2fa']),
    id: z.string().min(1, "ID kiritilishi shart"),
    password: z.string().min(6, "Parol kamida 6 belgidan iborat bo'lishi kerak").optional(),
    code: z.string().length(6, "Tasdiqlash kodi 6 ta raqam bo'lishi kerak").optional(),
});

/**
 * Validator for Wallet/P2P Transfers
 */
export const transferSchema = z.object({
    senderPhone: z.string().regex(/^\+998\d{9}$/, "Noto'g'ri raqam formati"),
    receiverPhone: z.string().regex(/^\+998\d{9}$/, "Noto'g'ri raqam formati"),
    amount: z.number().int().positive("Summa musbat bo'lishi kerak").min(1000, "Minimal o'tkazma: 1 000 so'm"),
    isGift: z.boolean().optional(),
});

/**
 * Validator for Checkout/Order submission
 */
export const checkoutSchema = z.object({
    items: z.array(z.object({
        id: z.string().uuid("Noto'g'ri mahsulot ID"),
        quantity: z.number().int().positive().max(99),
    })).min(1, "Savat bo'sh bo'lishi mumkin emas"),
    address: z.string().min(5, "Manzil juda qisqa").max(500, "Manzil juda uzun"),
    phone: z.string().regex(/^\+998\d{9}$/, "Telefon raqami noto'g'ri"),
    coords: z.array(z.number()).length(2).optional(),
});
