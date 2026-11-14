import { z } from 'zod';

// Zod schema：Worker 檢查 PUT 內容、前端檢查匯入的 JSON。
// 一律 .passthrough() / looseObject：保留資料表沒有對應欄位的屬性（存進 extra），不丟資料。

const id = z.union([z.string().min(1), z.number()]).transform(String);
const num = z.number().finite();

export const venueSchema = z.looseObject({
  id,
  name: z.string().optional(),
  subtitle: z.string().optional(),
});

export const commandSlotSchema = z.looseObject({
  id,
  type: z.string().optional(),
  startMin: num.optional(),
  endMin: num.optional(),
  staff: z.string().optional(),
  content: z.string().optional(),
});

export const daySchema = z.looseObject({
  id,
  label: z.string().optional(),
  category: z.string().optional(),
  commandDeckEnabled: z.boolean().optional(),
  generalStaff: z
    .looseObject({
      hosts: z.string().optional(),
      recorders: z.string().optional(),
      stageControl: z.string().optional(),
    })
    .optional(),
  commandSlots: z.array(commandSlotSchema).optional(),
});

export const refereeSchema = z.looseObject({
  role: z.string().optional(),
  name: z.string().optional(),
});

export const attachmentSchema = z.looseObject({
  name: z.string().optional(),
  type: z.string().optional(),
  dataUrl: z.string().optional(),
});

export const eventSchema = z.looseObject({
  id,
  dateId: z.string().optional(),
  venueIds: z.array(z.string()).optional(),
  startMin: num.optional(),
  endMin: num.optional(),
  checkInOffsetMin: num.optional(),
  linkPrev: z.boolean().optional(),
  title: z.string().optional(),
  color: z.string().optional(),
  referees: z.array(refereeSchema).optional(),
  volunteerCount: num.optional(),
  volunteerTask: z.string().optional(),
  studentCount: num.optional(),
  studentTask: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  laneNote: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  actualStartMin: num.nullable().optional(),
  actualEndMin: num.nullable().optional(),
});

/** 檢查同一類資料內 id 不重複（否則 D1 主鍵衝突、整次儲存失敗） */
function uniqueIds<T extends { id: string }>(label: string) {
  return (list: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item.id)) ctx.addIssue({ code: 'custom', message: `${label} 的 id 重複：${item.id}` });
      seen.add(item.id);
    }
  };
}

export const projectDataSchema = z
  .looseObject({
    venues: z.array(venueSchema).default([]).superRefine(uniqueIds('venues')),
    dates: z.array(daySchema).default([]).superRefine(uniqueIds('dates')),
    events: z.array(eventSchema).superRefine(uniqueIds('events')),
  })
  .superRefine((data, ctx) => {
    const slots = data.dates.flatMap((d) => d.commandSlots ?? []);
    uniqueIds<{ id: string }>('commandSlots')(slots, ctx);
  });

export type ProjectDataInput = z.input<typeof projectDataSchema>;

/** 把 Zod 錯誤轉成一行中文訊息 */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}：${i.message}` : i.message)).join('；');
}
