import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";

const runId = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

export function uniqueEmail(tag: string): string {
  return `qa-auto-${runId}-${tag}-${randomBytes(3).toString("hex")}@example.com`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${randomBytes(3).toString("hex")}`;
}

export async function makePdf(text = "QA test document"): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 100, size: 16, font });
  return Buffer.from(await doc.save());
}
