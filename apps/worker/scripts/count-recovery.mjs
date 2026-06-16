import { prisma } from "@crickverse/db";
const total = await prisma.careerPlayer.count({ where: { cricinfoId: { not: null } } });
const done = await prisma.playerInningsHistory.groupBy({ by: ["cricinfoId"] });
console.log(JSON.stringify({ totalWithCricinfoId: total, recovered: done.length, pending: total - done.length }));
await prisma.$disconnect();
