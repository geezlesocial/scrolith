import { Request, Response } from "express";
import prisma from "../utils/prismaClient";
import { sendSystemMessage } from "../services/systemMessaging";
import { syncManagedProjectsForEntity } from "../services/aiManaged.service";
import { publishIntegrationEvent } from "../services/talentCloud.service";
import realtime from "../utils/realtime";
import {
  buildContractPlan,
  normalizeContractTypeDb,
  normalizePaymentCycleDb,
  normalizeStoredMilestones,
  normalizeStoredPaymentSchedule,
  paymentCycleDbToView
} from "../utils/contractConversion";

type RoleNorm = "admin" | "superadmin" | "freelancer" | "client" | "employer" | "user" | "guest" | "";

const normalizeRole = (role?: string): RoleNorm => {
  const r = (role || "").toString().toLowerCase().trim();
  if (!r) return "";
  if (r.includes("superadmin")) return "superadmin";
  if (r.includes("admin")) return "admin";
  if (r.includes("freelancer") || r.includes("seller")) return "freelancer";
  if (r.includes("client")) return "client";
  if (r.includes("employer")) return "employer";
  if (r.includes("guest")) return "guest";
  return "user";
};

const isAdminRole = (role: RoleNorm) => role === "admin" || role === "superadmin";

const resolveEffectiveRole = (userRole: RoleNorm, queryRole: RoleNorm): RoleNorm => {
  if (!queryRole) return userRole;
  if (!userRole) return queryRole;

  // Never allow query params to escalate into admin privileges.
  if (queryRole === "admin" || queryRole === "superadmin") {
    return isAdminRole(userRole) ? userRole : userRole;
  }

  // Allow explicit client/freelancer view filters for users who can switch dashboards.
  if (queryRole === "freelancer" || queryRole === "client" || queryRole === "employer") {
    return queryRole;
  }

  return userRole;
};

const getAuth = (req: Request) => {
  const user = (req.user as { id: string; email?: string; role?: string } | undefined) || null;
  const userRole = normalizeRole(user?.role);
  const queryRole = normalizeRole(req.query.role as string);
  const role = resolveEffectiveRole(userRole, queryRole);
  const userId = user?.id || (req.query.userId as string) || "";
  return { user, role, userId };
};

const toMoney = (value: number) => Number((Number(value || 0)).toFixed(2));

const paymentMethodDisplayName = (raw?: string | null) => {
  const id = (raw || "").toString().trim().toLowerCase();
  if (!id || id === "wallet" || id === "balance") return "Wallet Balance";
  if (id === "stripe" || id === "striped") return "Stripe Payment";
  return id
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const paymentSourceDisplayName = (paymentMethodId?: string | null, fundingProvider?: string | null) => {
  const method = paymentMethodDisplayName(paymentMethodId);
  const funding = (fundingProvider || "").toString().trim().toLowerCase();
  if (method === "Wallet Balance" && funding && funding !== "wallet" && funding !== "balance") {
    return `Wallet Balance (funded via ${paymentMethodDisplayName(funding)})`;
  }
  return method;
};

const ensureUserExistsInTx = async (tx: any, userId: string) => {
  const existing = await tx.user.findUnique({ where: { id: userId } });
  if (existing) return existing;
  const safeLocal = userId.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 32) || "user";
  const email = `${safeLocal}@local.dev`;
  return tx.user.create({
    data: {
      id: userId,
      email,
      role: "USER",
      isActive: true,
      isVerified: false
    }
  });
};

const getOrCreateWalletInTx = async (tx: any, userId: string) => {
  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  await ensureUserExistsInTx(tx, userId);
  return tx.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      frozen: false,
      currency: "USD"
    }
  });
};

const toContractTypeStr = (dbType: any): "fixed" | "hourly" => {
  const t = (dbType || "").toString().toUpperCase();
  return t === "FIXED" ? "fixed" : "hourly";
};

const toPaymentCycleStr = (dbCycle: any): "weekly" | "bi-weekly" | "monthly" =>
  paymentCycleDbToView(dbCycle);

const toContractStatusStr = (dbStatus: any): "active" | "paused" | "terminated" | "completed" => {
  const s = (dbStatus || "").toString().toUpperCase();
  if (s === "PAUSED") return "paused";
  if (s === "TERMINATED") return "terminated";
  if (s === "COMPLETED") return "completed";
  return "active";
};

const parseContractStatusEnum = (statusRaw?: string) => {
  const s = (statusRaw || "").toString().toLowerCase().trim();
  if (s === "paused") return "PAUSED";
  if (s === "terminated") return "TERMINATED";
  if (s === "completed") return "COMPLETED";
  return "ACTIVE";
};

const parseContractTypeEnum = (typeRaw?: string) => normalizeContractTypeDb(typeRaw, "HOURLY");

const parsePaymentCycleEnum = (cycleRaw?: string) => normalizePaymentCycleDb(cycleRaw, "WEEKLY");

const timeEntryStatusToStr = (dbStatus: any): "pending" | "approved" | "paid" | "rejected" => {
  const s = (dbStatus || "").toString().toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "PAID") return "paid";
  if (s === "REJECTED") return "rejected";
  return "pending";
};

const computeTotalsForContract = async (contractId: string) => {
  const entries = await prisma.timeEntry.findMany({
    where: { contractId }
  });

  const totalMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
  const totalHoursLogged = totalMinutes / 60;

  const totalPaid = entries
    .filter(e => (e.status || "").toString().toUpperCase() === "PAID")
    .reduce((sum, e) => sum + (Number(e.earnings) || 0), 0);

  const earningsPending = entries
    .filter(e => (e.status || "").toString().toUpperCase() !== "PAID")
    .reduce((sum, e) => sum + (Number(e.earnings) || 0), 0);

  return { totalHoursLogged, totalPaid, earningsPending };
};

const serializeContract = async (c: any) => {
  const totals = await computeTotalsForContract(c.id);

  const activeSession = await prisma.trackingSession.findFirst({
    where: { contractId: c.id, status: "ACTIVE" },
    select: { id: true }
  });

  return {
    id: c.id,
    title: c.title,
    clientId: c.clientId,
    clientName: c.clientName || "Client",
    freelancerId: c.freelancerId,
    freelancerName: c.freelancerName || "Freelancer",
    type: toContractTypeStr(c.type),
    hourlyRate: Number(c.hourlyRate || 0),
    paymentCycle: toPaymentCycleStr(c.paymentCycle),
    contractValue: c.contractValue !== undefined && c.contractValue !== null ? Number(c.contractValue) : null,
    deliveryDays: c.deliveryDays !== undefined && c.deliveryDays !== null ? Number(c.deliveryDays) : null,
    paymentSchedule: normalizeStoredPaymentSchedule(c.paymentSchedule),
    milestones: normalizeStoredMilestones(c.milestones),
    status: toContractStatusStr(c.status),
    startDate: (c.startDate instanceof Date ? c.startDate : new Date(c.startDate)).toISOString(),
    description: c.description || "",
    activeSessionId: activeSession?.id || undefined,
    ...totals
  };
};

const mutateMilestoneStatus = (
  milestonesRaw: any,
  milestoneId: string,
  status: "pending" | "submitted" | "approved" | "paid"
) => {
  const current = normalizeStoredMilestones(milestonesRaw);
  const index = current.findIndex((entry) => entry.id === milestoneId);
  if (index === -1) {
    throw new Error("Milestone not found");
  }

  const timestamp = new Date().toISOString();
  const next = current.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const updated: any = { ...entry, status };
    if (status === "submitted") updated.submittedAt = timestamp;
    if (status === "approved") updated.approvedAt = timestamp;
    if (status === "paid") updated.paidAt = timestamp;
    return updated;
  });

  return next;
};

const ensureContractAccess = (role: RoleNorm, userId: string, contract: any) => {
  if (isAdminRole(role)) return true;
  if (!userId) return false;
  return contract.freelancerId === userId || contract.clientId === userId;
};

export const listContracts = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    let where: any = {};

    if (isAdminRole(role)) {
      const qUserId = (req.query.userId as string) || "";
      const qRole = normalizeRole(req.query.role as string);
      if (qUserId && qRole === "freelancer") where.freelancerId = qUserId;
      if (qUserId && (qRole === "client" || qRole === "employer")) where.clientId = qUserId;
    } else {
      if (!userId) return res.json({ success: true, data: [] });

      // For non-admin users, always scope to "my contracts", then narrow by requested view role.
      const qRole = normalizeRole(req.query.role as string);
      if (qRole === "freelancer") {
        where.freelancerId = userId;
      } else if (qRole === "client" || qRole === "employer") {
        where.clientId = userId;
      } else {
        where.OR = [{ freelancerId: userId }, { clientId: userId }];
      }
    }

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });

    const enriched = await Promise.all(contracts.map(serializeContract));
    return res.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error("listContracts error:", err);
    return res.status(500).json({ success: false, error: "Failed to list contracts" });
  }
};

export const getContract = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!ensureContractAccess(role, userId, contract)) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const payload = await serializeContract(contract);
    return res.json({ success: true, data: payload });
  } catch (err: any) {
    console.error("getContract error:", err);
    return res.status(500).json({ success: false, error: "Failed to load contract" });
  }
};

export const createContract = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const title = req.body?.title;
    const clientId = req.body?.clientId;
    const freelancerId = req.body?.freelancerId;
    if (!title || !clientId || !freelancerId) {
      return res.status(400).json({ success: false, error: "title, clientId, freelancerId are required" });
    }
    if (!isAdminRole(role)) {
      if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
      if (clientId !== userId) {
        return res.status(403).json({ success: false, error: "clientId must match authenticated user" });
      }
    }
    if (clientId === freelancerId) {
      return res.status(400).json({ success: false, error: "Client and freelancer cannot be the same user" });
    }

    const plan = buildContractPlan({
      proposal: {
        proposedAmount: req.body?.contractValue ?? req.body?.hourlyRate ?? req.body?.hourly_rate,
        proposedTimeline: req.body?.deliveryDays ?? req.body?.delivery_days,
        job: {
          type: req.body?.type
        }
      },
      payload: req.body,
      settings: null
    });

    const created = await prisma.contract.create({
      data: {
        id: req.body?.id || undefined,
        title,
        clientId,
        freelancerId,
        clientName: req.body?.clientName || "Client",
        freelancerName: req.body?.freelancerName || "Freelancer",
        type: parseContractTypeEnum(plan.contractType),
        hourlyRate: Number(plan.hourlyRate || 0),
        paymentCycle: parsePaymentCycleEnum(plan.paymentCycle),
        contractValue: plan.contractValue,
        deliveryDays: plan.deliveryDays,
        paymentSchedule: plan.paymentSchedule as any,
        milestones: plan.milestones as any,
        status: parseContractStatusEnum(req.body?.status),
        startDate: plan.startDate,
        description: plan.description || "",
        jobId: req.body?.jobId || null,
        sourceProposalId: req.body?.sourceProposalId || null
      }
    });

    const payload = await serializeContract(created);
    try {
      const clientLink = `/client/dashboard?tab=contracts&contract=${created.id}&contract_id=${created.id}`;
      const freelancerLink = `/freelancer/dashboard?tab=contracts&contract=${created.id}&contract_id=${created.id}`;

      void sendSystemMessage({
        templateKey: "contract_update",
        userId: created.clientId,
        context: {
          contract: {
            title: created.title,
            status: created.status,
            link: clientLink
          }
        },
        actionUrl: clientLink,
        typeOverride: "contract"
      });

      void sendSystemMessage({
        templateKey: "contract_update",
        userId: created.freelancerId,
        context: {
          contract: {
            title: created.title,
            status: created.status,
            link: freelancerLink
          }
        },
        actionUrl: freelancerLink,
        typeOverride: "contract"
      });
    } catch (notifyError) {
      console.warn("Contract create notification failed", notifyError);
    }

    return res.json({ success: true, data: payload });
  } catch (err: any) {
    console.error("createContract error:", err);
    const message = String(err?.message || "").trim();
    if (message) {
      return res.status(400).json({ success: false, error: message });
    }
    return res.status(500).json({ success: false, error: "Failed to create contract" });
  }
};

export const updateContractMilestoneStatus = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!ensureContractAccess(role, userId, contract)) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const statusRaw = String(req.body?.status || "").trim().toLowerCase();
    if (!["pending", "submitted", "approved", "paid"].includes(statusRaw)) {
      return res.status(400).json({ success: false, error: "Invalid milestone status" });
    }

    const isFreelancer = contract.freelancerId === userId;
    const isClient = contract.clientId === userId || isAdminRole(role);
    if (isFreelancer && statusRaw !== "submitted") {
      return res.status(403).json({ success: false, error: "Freelancers can only submit milestones" });
    }
    if (!isFreelancer && !isClient) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const milestones = mutateMilestoneStatus(contract.milestones, req.params.milestoneId, statusRaw as any);
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { milestones: milestones as any }
    });
    await syncManagedProjectsForEntity('CONTRACT', contract.id, {
      milestoneId: req.params.milestoneId,
      status: statusRaw,
      actorUserId: userId
    });
    await publishIntegrationEvent('contract.milestone.updated', {
      contractId: updated.id,
      milestoneId: req.params.milestoneId,
      status: statusRaw,
      clientId: updated.clientId,
      freelancerId: updated.freelancerId
    });

    return res.json({
      success: true,
      data: {
        id: updated.id,
        milestones: normalizeStoredMilestones(updated.milestones)
      }
    });
  } catch (err: any) {
    console.error("updateContractMilestoneStatus error:", err);
    const message = err?.message === "Milestone not found" ? err.message : "Failed to update milestone status";
    const status = err?.message === "Milestone not found" ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const updateContractStatus = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!isAdminRole(role) && contract.clientId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const statusEnum = parseContractStatusEnum(req.body?.status);
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: statusEnum }
    });

    try {
      const clientLink = `/client/dashboard?tab=contracts&contract=${contract.id}&contract_id=${contract.id}`;
      const freelancerLink = `/freelancer/dashboard?tab=contracts&contract=${contract.id}&contract_id=${contract.id}`;
      void sendSystemMessage({
        templateKey: "contract_update",
        userId: contract.clientId,
        context: {
          contract: { title: contract.title, status: statusEnum, link: clientLink }
        },
        actionUrl: clientLink,
        typeOverride: "contract"
      });
      void sendSystemMessage({
        templateKey: "contract_update",
        userId: contract.freelancerId,
        context: {
          contract: { title: contract.title, status: statusEnum, link: freelancerLink }
        },
        actionUrl: freelancerLink,
        typeOverride: "contract"
      });
    } catch (notifyError) {
      console.warn("Contract status notification failed", notifyError);
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("updateContractStatus error:", err);
    return res.status(500).json({ success: false, error: "Failed to update contract status" });
  }
};

export const startTracking = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);

    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (contract.freelancerId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    if (contract.status !== "ACTIVE") {
      return res.status(400).json({ success: false, error: "Contract is not active" });
    }

    if (contract.type !== "HOURLY") {
      return res.status(400).json({ success: false, error: "Time tracking allowed only for hourly contracts" });
    }

    const existing = await prisma.trackingSession.findFirst({
      where: { contractId: contract.id, status: "ACTIVE" }
    });
    if (existing) {
      return res.json({
        success: true,
        data: {
          sessionId: existing.id,
          contractId: existing.contractId,
          contractTitle: contract.title,
          freelancerId: existing.freelancerId,
          freelancerName: contract.freelancerName || "Freelancer",
          startedAt: existing.startedAt.toISOString(),
          status: "active"
        }
      });
    }

    const session = await prisma.trackingSession.create({
      data: {
        contractId: contract.id,
        freelancerId: userId,
        status: "ACTIVE"
      }
    });

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        contractId: contract.id,
        contractTitle: contract.title,
        freelancerId: contract.freelancerId,
        freelancerName: contract.freelancerName || "Freelancer",
        startedAt: session.startedAt.toISOString(),
        status: "active"
      }
    });
  } catch (err: any) {
    console.error("startTracking error:", err);
    return res.status(500).json({ success: false, error: "Failed to start tracking" });
  }
};

export const stopTracking = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);

    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (contract.freelancerId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const session = await prisma.trackingSession.findFirst({
      where: { contractId: contract.id, status: "ACTIVE" }
    });
    if (!session) return res.status(404).json({ success: false, error: "No active session found" });

    const endTime = new Date();
    const durationMinutes = Math.max(
      1,
      Math.ceil((endTime.getTime() - session.startedAt.getTime()) / 60000)
    );

    const hourlyRate = Number(contract.hourlyRate || 0);
    const earnings = (durationMinutes / 60) * hourlyRate;

    const notes = (req.body?.notes || "").toString();
    const screenshots = Array.isArray(req.body?.screenshots) ? req.body.screenshots : [];

    const entry = await prisma.timeEntry.create({
      data: {
        contractId: contract.id,
        freelancerId: contract.freelancerId,
        startTime: session.startedAt,
        endTime,
        durationMinutes,
        description: notes || "Tracking session",
        status: "PENDING",
        earnings,
        screenshots
      }
    });

    await prisma.trackingSession.update({
      where: { id: session.id },
      data: { status: "STOPPED", endedAt: endTime }
    });

    return res.json({
      success: true,
      data: {
        id: entry.id,
        contractId: entry.contractId,
        freelancerId: entry.freelancerId,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime ? entry.endTime.toISOString() : undefined,
        durationMinutes: entry.durationMinutes,
        description: entry.description,
        status: timeEntryStatusToStr(entry.status),
        earnings: Number(entry.earnings || 0),
        screenshots: entry.screenshots || [],
        activityScore: entry.activityScore ?? undefined
      }
    });
  } catch (err: any) {
    console.error("stopTracking error:", err);
    return res.status(500).json({ success: false, error: "Failed to stop tracking" });
  }
};

export const getActiveSessionForContract = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!ensureContractAccess(role, userId, contract) && !isAdminRole(role)) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const session = await prisma.trackingSession.findFirst({
      where: { contractId: contract.id, status: "ACTIVE" },
      orderBy: { startedAt: "desc" }
    });

    if (!session) return res.json({ success: true, data: null });

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        contractId: session.contractId,
        freelancerId: session.freelancerId,
        startedAt: session.startedAt.toISOString(),
        status: "active",
        elapsedSeconds: Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
      }
    });
  } catch (err: any) {
    console.error("getActiveSessionForContract error:", err);
    return res.status(500).json({ success: false, error: "Failed to load active session" });
  }
};

export const listActiveSessions = async (req: Request, res: Response) => {
  try {
    const { role } = getAuth(req);
    if (!isAdminRole(role)) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const sessions = await prisma.trackingSession.findMany({
      where: { status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      include: { contract: true }
    });

    const enriched = sessions.map((s) => ({
      sessionId: s.id,
      contractId: s.contractId,
      contractTitle: s.contract?.title || "Contract",
      freelancerId: s.freelancerId,
      freelancerName: s.contract?.freelancerName || "Freelancer",
      startedAt: s.startedAt.toISOString(),
      status: "active",
      elapsedSeconds: Math.floor((Date.now() - s.startedAt.getTime()) / 1000)
    }));

    return res.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error("listActiveSessions error:", err);
    return res.status(500).json({ success: false, error: "Failed to list active sessions" });
  }
};

export const forceStopSession = async (req: Request, res: Response) => {
  try {
    const { role } = getAuth(req);
    if (!isAdminRole(role)) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const session = await prisma.trackingSession.findUnique({
      where: { id: req.params.sessionId },
      include: { contract: true }
    });
    if (!session) return res.status(404).json({ success: false, error: "Active session not found" });
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ success: false, error: "Session is not active" });
    }

    const contract = session.contract;
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found for session" });

    const endTime = new Date();
    const durationMinutes = Math.max(
      1,
      Math.ceil((endTime.getTime() - session.startedAt.getTime()) / 60000)
    );

    const hourlyRate = Number(contract.hourlyRate || 0);
    const earnings = (durationMinutes / 60) * hourlyRate;

    const notes = (req.body?.notes || "Admin Force Stop").toString();

    const entry = await prisma.timeEntry.create({
      data: {
        contractId: contract.id,
        freelancerId: session.freelancerId,
        startTime: session.startedAt,
        endTime,
        durationMinutes,
        description: notes,
        status: "PENDING",
        earnings,
        screenshots: []
      }
    });

    await prisma.trackingSession.update({
      where: { id: session.id },
      data: { status: "STOPPED", endedAt: endTime }
    });

    return res.json({
      success: true,
      data: {
        id: entry.id,
        contractId: entry.contractId,
        freelancerId: entry.freelancerId,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime ? entry.endTime.toISOString() : undefined,
        durationMinutes: entry.durationMinutes,
        description: entry.description,
        status: timeEntryStatusToStr(entry.status),
        earnings: Number(entry.earnings || 0),
        screenshots: entry.screenshots || []
      }
    });
  } catch (err: any) {
    console.error("forceStopSession error:", err);
    return res.status(500).json({ success: false, error: "Failed to force stop session" });
  }
};

export const listTimeEntries = async (req: Request, res: Response) => {
  try {
    const { role } = getAuth(req);
    if (!isAdminRole(role)) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const contractId = req.query.contractId as string | undefined;
    const freelancerId = req.query.freelancerId as string | undefined;
    const status = (req.query.status as string | undefined)?.toString().toUpperCase();
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 200);

    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (freelancerId) where.freelancerId = freelancerId;
    if (status) where.status = status;
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }

    const total = await prisma.timeEntry.count({ where });
    const items = await prisma.timeEntry.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit
    });

    return res.json({
      success: true,
      data: {
        items: items.map((e) => ({
          id: e.id,
          contractId: e.contractId,
          freelancerId: e.freelancerId,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime ? e.endTime.toISOString() : undefined,
          durationMinutes: e.durationMinutes,
          description: e.description,
          status: timeEntryStatusToStr(e.status),
          earnings: Number(e.earnings || 0),
          screenshots: e.screenshots || [],
          activityScore: e.activityScore ?? undefined
        })),
        total
      }
    });
  } catch (err: any) {
    console.error("listTimeEntries error:", err);
    return res.status(500).json({ success: false, error: "Failed to list time entries" });
  }
};

export const listTimeEntriesForContract = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!ensureContractAccess(role, userId, contract)) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const entries = await prisma.timeEntry.findMany({
      where: { contractId },
      orderBy: { startTime: "desc" }
    });

    return res.json({
      success: true,
      data: entries.map((e) => ({
        id: e.id,
        contractId: e.contractId,
        freelancerId: e.freelancerId,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime ? e.endTime.toISOString() : undefined,
        durationMinutes: e.durationMinutes,
        description: e.description,
        status: timeEntryStatusToStr(e.status),
        earnings: Number(e.earnings || 0),
        screenshots: e.screenshots || [],
        activityScore: e.activityScore ?? undefined
      }))
    });
  } catch (err: any) {
    console.error("listTimeEntriesForContract error:", err);
    return res.status(500).json({ success: false, error: "Failed to list contract time entries" });
  }
};

export const logTimeEntry = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (contract.freelancerId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const startTime = req.body?.startTime ? new Date(req.body.startTime) : new Date();
    const endTime = req.body?.endTime ? new Date(req.body.endTime) : new Date();
    const durationMinutes = Number(req.body?.durationMinutes || 0);

    const hourlyRate = Number(contract.hourlyRate || 0);
    const earnings =
      Number(req.body?.earnings) ||
      (durationMinutes > 0 ? (durationMinutes / 60) * hourlyRate : 0);

    const entry = await prisma.timeEntry.create({
      data: {
        contractId,
        freelancerId: contract.freelancerId,
        startTime,
        endTime,
        durationMinutes,
        description: req.body?.description || "Manual entry",
        status: "PENDING",
        earnings,
        screenshots: Array.isArray(req.body?.screenshots) ? req.body.screenshots : [],
        activityScore: req.body?.activityScore ? Number(req.body.activityScore) : null
      }
    });

    return res.json({
      success: true,
      data: {
        id: entry.id,
        contractId: entry.contractId,
        freelancerId: entry.freelancerId,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime ? entry.endTime.toISOString() : undefined,
        durationMinutes: entry.durationMinutes,
        description: entry.description,
        status: timeEntryStatusToStr(entry.status),
        earnings: Number(entry.earnings || 0),
        screenshots: entry.screenshots || [],
        activityScore: entry.activityScore ?? undefined
      }
    });
  } catch (err: any) {
    console.error("logTimeEntry error:", err);
    return res.status(500).json({ success: false, error: "Failed to log time entry" });
  }
};

export const approveTimeEntry = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ success: false, error: "Time entry not found" });

    const contract = await prisma.contract.findUnique({ where: { id: entry.contractId } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!isAdminRole(role) && contract.clientId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { status: "APPROVED" }
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("approveTimeEntry error:", err);
    return res.status(500).json({ success: false, error: "Failed to approve time entry" });
  }
};

export const payContractDue = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!isAdminRole(role) && contract.clientId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const requestedPaymentMethodId = (req.body?.paymentMethodId || "wallet").toString().trim().toLowerCase();
    const fundingProvider = (req.body?.fundingProvider || "").toString().trim().toLowerCase();
    const paymentMethodId = requestedPaymentMethodId === "balance" ? "wallet" : requestedPaymentMethodId;

    if (paymentMethodId !== "wallet") {
      return res.status(400).json({
        success: false,
        error: "Direct contract settlement supports wallet balance. Complete external checkout and retry with wallet.",
        code: "ERR_CONTRACT_WALLET_REQUIRED"
      });
    }

    const entriesToPay = await prisma.timeEntry.findMany({
      where: {
        contractId,
        status: { in: ["APPROVED", "PENDING"] }
      }
    });

    if (!entriesToPay.length) {
      return res.json({ success: true, data: { amount: 0, paymentMethodId, fundingProvider: fundingProvider || null } });
    }

    const provisionalAmount = toMoney(entriesToPay.reduce((sum, entry) => sum + Number(entry.earnings || 0), 0));
    if (provisionalAmount <= 0) {
      return res.json({ success: true, data: { amount: 0, paymentMethodId, fundingProvider: fundingProvider || null } });
    }

    let paidAmount = 0;
    try {
      const settlement = await prisma.$transaction(async (tx) => {
        const freshEntries = await tx.timeEntry.findMany({
          where: {
            contractId,
            status: { in: ["APPROVED", "PENDING"] }
          }
        });

        const totalDue = toMoney(freshEntries.reduce((sum, entry) => sum + Number(entry.earnings || 0), 0));
        if (totalDue <= 0) {
          return { amount: 0 };
        }

        const clientWallet = await getOrCreateWalletInTx(tx, contract.clientId);
        const freelancerWallet = await getOrCreateWalletInTx(tx, contract.freelancerId);

        if (clientWallet.frozen) {
          throw new Error("Client wallet is frozen");
        }

        const availableBalance = Number(clientWallet.balance || 0);
        if (availableBalance < totalDue) {
          throw new Error("Insufficient wallet balance");
        }

        await tx.wallet.update({
          where: { id: clientWallet.id },
          data: { balance: { decrement: totalDue } }
        });

        await tx.wallet.update({
          where: { id: freelancerWallet.id },
          data: { pendingClearance: { increment: totalDue } }
        });

        await tx.timeEntry.updateMany({
          where: {
            contractId,
            status: { in: ["APPROVED", "PENDING"] }
          },
          data: { status: "PAID" }
        });

        const sourceLabel = paymentSourceDisplayName(paymentMethodId, fundingProvider);
        const referenceId = `contract_due:${contract.id}:${Date.now()}`;

        await tx.transaction.create({
          data: {
            userId: contract.clientId,
            walletId: clientWallet.id,
            type: "PAYMENT",
            amount: totalDue * -1,
            status: "COMPLETED",
            currency: clientWallet.currency || "USD",
            description: `Contract due payment for ${contract.title}`,
            referenceId,
            metadata: {
              contractId: contract.id,
              counterpartyUserId: contract.freelancerId,
              paymentSource: sourceLabel,
              fundingProvider: fundingProvider || null
            }
          }
        });

        await tx.transaction.create({
          data: {
            userId: contract.freelancerId,
            walletId: freelancerWallet.id,
            type: "TRANSFER",
            amount: totalDue,
            status: "PENDING",
            currency: freelancerWallet.currency || "USD",
            description: `Contract payment received for ${contract.title}`,
            referenceId,
            metadata: {
              contractId: contract.id,
              counterpartyUserId: contract.clientId,
              paymentSource: sourceLabel,
              fundingProvider: fundingProvider || null
            }
          }
        });

        return { amount: totalDue };
      });

      paidAmount = settlement.amount;
    } catch (settlementError: any) {
      const msg = (settlementError?.message || "").toString();
      if (msg.toLowerCase().includes("insufficient wallet")) {
        return res.status(400).json({ success: false, error: "Insufficient wallet balance", code: "ERR_WALLET_INSUFFICIENT" });
      }
      if (msg.toLowerCase().includes("wallet is frozen")) {
        return res.status(403).json({ success: false, error: msg, code: "ERR_WALLET_FROZEN" });
      }
      throw settlementError;
    }

    try {
      const payer = await prisma.user.findUnique({
        where: { id: contract.clientId },
        select: { name: true, email: true }
      });
      const freelancerLink = `/freelancer/dashboard?tab=contracts&contract=${contract.id}&contract_id=${contract.id}`;
      const payerLabel = payer?.name || payer?.email || contract.clientName || "Client";
      const sourceLabel = paymentSourceDisplayName(paymentMethodId, fundingProvider);
      const amountLabel = paidAmount.toFixed(2);

      void sendSystemMessage({
        templateKey: "system_notification",
        userId: contract.freelancerId,
        context: {
          notification: {
            title: "Contract payment received",
            message: `${payerLabel} paid $${amountLabel} for "${contract.title}" via ${sourceLabel}.`,
            link: freelancerLink
          }
        },
        actionUrl: freelancerLink,
        typeOverride: "contract_payment"
      });
    } catch (notifyError) {
      console.warn("Contract payment notification failed", notifyError);
    }

    try {
      realtime.emitToUser(contract.clientId, "wallet:updated", {
        source: "contract_due_payment",
        contractId: contract.id
      });
      realtime.emitToUser(contract.freelancerId, "wallet:updated", {
        source: "contract_due_payment",
        contractId: contract.id
      });
    } catch (emitError) {
      console.warn("Contract payment realtime emit failed", emitError);
    }

    return res.json({
      success: true,
      data: {
        amount: paidAmount,
        paymentMethodId,
        fundingProvider: fundingProvider || null,
        paymentSource: paymentSourceDisplayName(paymentMethodId, fundingProvider)
      }
    });
  } catch (err: any) {
    console.error("payContractDue error:", err);
    return res.status(500).json({ success: false, error: "Failed to pay contract due" });
  }
};
