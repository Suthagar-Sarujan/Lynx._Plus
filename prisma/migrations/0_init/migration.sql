-- CreateTable
CREATE TABLE `Story` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('SRI_LANKA', 'INDIA', 'FOREIGN') NOT NULL,
    `sourceUrl` VARCHAR(500) NULL,
    `sourceName` VARCHAR(80) NULL,
    `autoQueuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Story_sourceUrl_key`(`sourceUrl`),
    INDEX `Story_category_idx`(`category`),
    INDEX `Story_autoQueuedAt_idx`(`autoQueuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Post` (
    `id` VARCHAR(191) NOT NULL,
    `storyId` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `mode` ENUM('TEMPLATE', 'DIRECT_IMAGE') NOT NULL DEFAULT 'TEMPLATE',
    `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `dateLabel` VARCHAR(191) NULL,
    `yearLabel` VARCHAR(191) NULL,
    `badgeWord` VARCHAR(191) NULL DEFAULT 'NEWS',
    `showBreaking` BOOLEAN NOT NULL DEFAULT true,
    `showNews` BOOLEAN NOT NULL DEFAULT true,
    `bodyText` TEXT NULL,
    `creditTag` VARCHAR(191) NULL DEFAULT ': LYNX._CINE',
    `bodyFont` VARCHAR(40) NULL,
    `bodyFontSize` INTEGER NULL,
    `bodyAlign` VARCHAR(10) NULL,
    `bodyLineHeight` INTEGER NULL,
    `directTitle` VARCHAR(191) NULL,
    `photoUrl` TEXT NULL,
    `renderedImageUrl` TEXT NULL,
    `caption` TEXT NULL,
    `hashtags` TEXT NULL,
    `scheduledAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Post_storyId_idx`(`storyId`),
    INDEX `Post_status_idx`(`status`),
    INDEX `Post_language_idx`(`language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishJob` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `platform` ENUM('FACEBOOK', 'INSTAGRAM') NOT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'SCHEDULED',
    `runAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `platformPostId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PublishJob_postId_idx`(`postId`),
    INDEX `PublishJob_status_runAt_idx`(`status`, `runAt`),
    UNIQUE INDEX `PublishJob_postId_platform_key`(`postId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor` VARCHAR(100) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(20) NULL,
    `entityId` VARCHAR(40) NULL,
    `summary` VARCHAR(300) NOT NULL,
    `detail` TEXT NULL,
    `ip` VARCHAR(64) NULL,

    INDEX `AuditLog_at_idx`(`at`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `platforms` VARCHAR(40) NOT NULL DEFAULT 'FACEBOOK,INSTAGRAM',
    `languages` VARCHAR(80) NOT NULL DEFAULT 'en',
    `dailyCap` INTEGER NOT NULL DEFAULT 12,
    `minGapMinutes` INTEGER NOT NULL DEFAULT 30,
    `languageStaggerMinutes` INTEGER NOT NULL DEFAULT 15,
    `activeFromHour` INTEGER NOT NULL DEFAULT 7,
    `activeToHour` INTEGER NOT NULL DEFAULT 23,
    `timezone` VARCHAR(60) NOT NULL DEFAULT 'Asia/Colombo',
    `maxAgeHours` INTEGER NOT NULL DEFAULT 12,
    `minPhotoWidth` INTEGER NOT NULL DEFAULT 0,
    `blockedKeywords` VARCHAR(1000) NOT NULL DEFAULT 'suicide,rape,sexual assault,child abuse',
    `reviewKeywords` VARCHAR(1000) NOT NULL DEFAULT 'election,elections,rally,protest,protests,minister,parliament,riot,riots,communal,religious,court,arrest,arrested,murder,killed,attack,war,pardon,president,cabinet,police',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MetaCredential` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `pageToken` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_storyId_fkey` FOREIGN KEY (`storyId`) REFERENCES `Story`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishJob` ADD CONSTRAINT `PublishJob_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

