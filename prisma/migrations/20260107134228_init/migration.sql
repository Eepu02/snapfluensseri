-- CreateTable
CREATE TABLE "Group" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "scheduleType" TEXT NOT NULL DEFAULT 'interval',
    "scheduleValue" TEXT NOT NULL DEFAULT '259200',
    "nextRunAt" DATETIME,
    "lastPickedUserId" BIGINT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "chatId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastSeenAt" DATETIME,
    "isOptedIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("chatId", "userId"),
    CONSTRAINT "GroupMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Group" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GroupMember_chatId_isOptedIn_idx" ON "GroupMember"("chatId", "isOptedIn");
