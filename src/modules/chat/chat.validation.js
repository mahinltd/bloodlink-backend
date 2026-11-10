import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const atLeastTextOrImage = (data, ctx) => {
  if (!data.text && !data.imageUrl) {
    ctx.addIssue({ code: 'custom', message: 'Message must contain text or image' });
  }
};

/* ---------- REST ---------- */

export const listConversationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const startConversationSchema = z.object({
  body: z.object({
    userId: objectId,
    requestId: objectId.nullish(),
  }),
});

export const conversationParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const messagesListSchema = z.object({
  params: z.object({ id: objectId }),
  query: z.object({
    before: objectId.optional(), // cursor — এর আগের মেসেজগুলো আসবে
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }),
});

// REST ফলব্যাক পাঠানো (দুর্বল নেটওয়ার্কে সকেট ছাড়া)
export const sendMessageRestSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      text: z.string().trim().max(2000).optional(),
      imageUrl: z.string().max(500).optional(),
    })
    .superRefine(atLeastTextOrImage),
});

export const blockParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/* ---------- Socket payloads (সার্ভার-সাইড ভ্যালিডেশন) ---------- */

export const socketSendSchema = z
  .object({
    conversationId: objectId,
    clientTempId: z.string().max(64).optional(), // অ্যাপের অপ্টিমিস্টিক UI ম্যাপিং
    text: z.string().trim().max(2000).optional(),
    imageUrl: z.string().max(500).optional(),
  })
  .superRefine(atLeastTextOrImage);

export const socketSeenSchema = z.object({ conversationId: objectId });

export const socketDeliveredSchema = z.object({
  conversationId: objectId,
  messageIds: z.array(objectId).min(1).max(100),
});

export const socketTypingSchema = z.object({ conversationId: objectId });

export const socketPresenceSchema = z.object({ userId: objectId });