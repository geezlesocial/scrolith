-- Add Scrolitha Resume/CV Builder and Resume/CV Reviewer records.
CREATE TABLE "ResumeDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "freelancerId" TEXT,
    "title" TEXT NOT NULL,
    "targetRole" TEXT,
    "targetIndustry" TEXT,
    "template" TEXT NOT NULL DEFAULT 'professional',
    "includePhoto" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceSnapshot" JSONB,
    "editableData" JSONB,
    "aiOutput" JSONB,
    "pdfUrl" TEXT,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "changeReason" TEXT,
    "prompt" TEXT,
    "editableData" JSONB,
    "aiOutput" JSONB,
    "pdfUrl" TEXT,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeAnalysis" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "jobDescription" TEXT NOT NULL,
    "requiredSkills" JSONB,
    "preferredSkills" JSONB,
    "seniorityLevel" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceFileUrl" TEXT,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "profileUrl" TEXT,
    "extractedText" TEXT,
    "normalizedCandidate" JSONB,
    "analysisResult" JSONB,
    "overallScore" INTEGER,
    "roleFitScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeDocument_userId_idx" ON "ResumeDocument"("userId");
CREATE INDEX "ResumeDocument_freelancerId_idx" ON "ResumeDocument"("freelancerId");
CREATE INDEX "ResumeDocument_status_idx" ON "ResumeDocument"("status");
CREATE INDEX "ResumeVersion_resumeId_idx" ON "ResumeVersion"("resumeId");
CREATE INDEX "ResumeAnalysis_clientId_idx" ON "ResumeAnalysis"("clientId");
CREATE INDEX "ResumeAnalysis_status_idx" ON "ResumeAnalysis"("status");
CREATE INDEX "ResumeAnalysis_createdAt_idx" ON "ResumeAnalysis"("createdAt");

ALTER TABLE "ResumeDocument"
  ADD CONSTRAINT "ResumeDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeVersion"
  ADD CONSTRAINT "ResumeVersion_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "ResumeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeAnalysis"
  ADD CONSTRAINT "ResumeAnalysis_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
