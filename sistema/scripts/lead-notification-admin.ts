// Ferramenta operacional: não envia diretamente. Requeue é consumido pelo worker.
import prisma from "../src/lib/prisma";
import { requeueLeadNotification } from "../src/lib/email-service";
async function main() {
  const [command, leadId, acknowledgement] = process.argv.slice(2);
  if (!leadId || !["status", "requeue"].includes(command)) throw new Error("Uso: tsx scripts/lead-notification-admin.ts status|requeue LEAD_ID [--ack-possible-duplicate]");
  if (command === "requeue") {
    console.log({ requeued: await requeueLeadNotification(leadId, acknowledgement === "--ack-possible-duplicate") });
  }
  console.log(await prisma.lpLead.findUnique({ where: { id: leadId }, select: {
    id: true, emailDeliveryStatus: true, emailAttemptCount: true,
    emailNextAttemptAt: true, emailLeaseUntil: true, emailLastError: true,
    emailFirstAttemptAt: true, emailProviderId: true,
  } }));
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
