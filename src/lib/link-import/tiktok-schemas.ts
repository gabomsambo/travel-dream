import { z } from 'zod';

const text = z.string().optional();
const id = z.union([z.string(), z.number()]).optional();

const TikTokAuthorSchema = z.object({
  uniqueId: text,
  nickname: text,
}).passthrough().partial().nullable().optional();

const TikTokPlaceSchema = z.object({
  id,
  name: text,
  address: text,
  city: text,
  category: text,
  ttTypeNameTiny: text,
}).passthrough().partial().nullable().optional();

const TikTokImageUrlSchema = z.object({ urlList: z.array(z.string()).optional() }).passthrough().partial().optional();

const TikTokImageSchema = z.object({
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  imageURL: TikTokImageUrlSchema,
}).passthrough().partial();

const TikTokImagePostSchema = z.object({
  title: text,
  images: z.array(TikTokImageSchema).optional(),
}).passthrough().partial().nullable().optional();

const TikTokVideoSchema = z.object({
  cover: text,
  originCover: text,
  dynamicCover: text,
}).passthrough().partial().nullable().optional();

const TikTokItemSchema = z.object({
  id,
  desc: text,
  contents: z.array(z.object({ desc: text }).passthrough().partial()).optional(),
  challenges: z.array(z.object({ title: text }).passthrough().partial()).optional(),
  textExtra: z.array(z.object({ hashtagName: text }).passthrough().partial()).optional(),
  author: TikTokAuthorSchema,
  poi: TikTokPlaceSchema,
  imagePost: TikTokImagePostSchema,
  video: TikTokVideoSchema,
  createTime: id,
}).passthrough().partial().nullable().optional();

const TikTokVideoDetailSchema = z.object({
  statusCode: id,
  statusMsg: text,
  itemInfo: z.object({ itemStruct: TikTokItemSchema }).passthrough().partial().optional(),
  shareMeta: z.object({ title: text, desc: text }).passthrough().partial().optional(),
}).passthrough().partial().optional();

export const TikTokRehydrationSchema = z.object({
  __DEFAULT_SCOPE__: z.object({
    'webapp.video-detail': TikTokVideoDetailSchema,
  }).passthrough().partial().optional(),
}).passthrough().partial();

export type TikTokRehydration = z.infer<typeof TikTokRehydrationSchema>;
export type TikTokItem = z.infer<typeof TikTokItemSchema>;
