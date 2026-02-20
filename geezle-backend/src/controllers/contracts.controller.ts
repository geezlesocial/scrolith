import { Request, Response } from "express";
import prisma from "../utils/prismaClient";
import { sendSystemMessage } from "../services/systemMessaging";

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

const getAuth = (req: Request) => {
  const user = (req.user as { id: string; email?: string; role?: string } | undefined) || null;
  const role = normalizeRole(user?.role || (req.query.role as string));
  const userId = user?.id || (req.query.userId as string) || "";
  return { user, role, userId };
};

const toContractTypeStr = (dbType: any): "fixed" | "hourly" => {
  const t = (dbType || "").toString().toUpperCase();
  return t === "FIXED" ? "fixed" : "hourly";
};

const toPaymentCycleStr = (dbCycle: any): "weekly" | "bi-weekly" | "monthly" => {
  const c = (dbCycle || "").toString().toUpperCase();
  if (c === "BI_WEEKLY") return "bi-weekly";
  if (c === "MONTHLY") return "monthly";
  return "weekly";
};

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

const parseContractTypeEnum = (typeRaw?: string) => {
  const t = (typeRaw || "").toString().toLowerCase().trim();
  if (t === "fixed") return "FIXED";
  return "HOURLY";
};

const parsePaymentCycleEnum = (cycleRaw?: string) => {
  const c = (cycleRaw || "").toString().toLowerCase().trim();
  if (c === "bi-weekly" || c === "bi_weekly" || c === "biweekly") return "BI_WEEKLY";
  if (c === "monthly") return "MONTHLY";
  return "WEEKLY";
};

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
    status: toContractStatusStr(c.status),
    startDate: (c.startDate instanceof Date ? c.startDate : new Date(c.startDate)).toISOString(),
    description: c.description || "",
    activeSessionId: activeSession?.id || undefined,
    ...totals
  };
};

const ensureContractAccess = (role: RoleNorm, userId: string, contract: any) => {
  if (isAdminRole(role)) return true;

  if (role === "freelancer") return contract.freelancerId === userId;
  if (role === "client" || role === "employer") return contract.clientId === userId;

  return false;
};

export const listContracts = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    if (!role) return res.json({ success: true, data: [] });

    let where: any = {};

    if (!isAdminRole(role)) {
      if (!userId) return res.json({ success: true, data: [] });

      if (role === "freelancer") where.freelancerId = userId;
      else if (role === "client" || role === "employer") where.clientId = userId;
      else return res.json({ success: true, data: [] });
    } else {
      const qUserId = (req.query.userId as string) || "";
      const qRole = normalizeRole(req.query.role as string);
      if (qUserId && qRole === "freelancer") where.freelancerId = qUserId;
      if (qUserId && (qRole === "client" || qRole === "employer")) where.clientId = qUserId;
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
    const { role } = getAuth(req);

    if (!(isAdminRole(role) || role === "client" || role === "employer")) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const title = req.body?.title;
    const clientId = req.body?.clientId;
    const freelancerId = req.body?.freelancerId;
    if (!title || !clientId || !freelancerId) {
      return res.status(400).json({ success: false, error: "title, clientId, freelancerId are required" });
    }

    const created = await prisma.contract.create({
      data: {
        id: req.body?.id || undefined,
        title,
        clientId,
        freelancerId,
        clientName: req.body?.clientName || "Client",
        freelancerName: req.body?.freelancerName || "Freelancer",
        type: parseContractTypeEnum(req.body?.type),
        hourlyRate: Number(req.body?.hourlyRate || 0),
        paymentCycle: parsePaymentCycleEnum(req.body?.paymentCycle),
        status: parseContractStatusEnum(req.body?.status),
        startDate: req.body?.startDate ? new Date(req.body.startDate) : new Date(),
        description: req.body?.description || "",
        jobId: req.body?.jobId || null,
        sourceProposalId: req.body?.sourceProposalId || null
      }
    });

    const payload = await serializeContract(created);
    return res.json({ success: true, data: payload });
  } catch (err: any) {
    console.error("createContract error:", err);
    return res.status(500).json({ success: false, error: "Failed to create contract" });
  }
};

export const updateContractStatus = async (req: Request, res: Response) => {
  try {
    const { role, userId } = getAuth(req);

    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (!(isAdminRole(role) || role === "client" || role === "employer")) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    if (!isAdminRole(role) && contract.clientId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const statusEnum = parseContractStatusEnum(req.body?.status);
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: statusEnum }
    });

    try {
      const contractLink = `/dashboard?tab=contracts&contract=${contract.id}&contract_id=${contract.id}`;
      void sendSystemMessage({
        templateKey: "contract_update",
        userId: contract.clientId,
        context: {
          contract: { title: contract.title, status: statusEnum, link: contractLink }
        },
        actionUrl: contractLink,
        typeOverride: "contract"
      });
      void sendSystemMessage({
        templateKey: "contract_update",
        userId: contract.freelancerId,
        context: {
          contract: { title: contract.title, status: statusEnum, link: contractLink }
        },
        actionUrl: contractLink,
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
    const { role, userId } = getAuth(req);

    if (role !== "freelancer") {
      return res.status(403).json({ success: false, error: "Freelancer access required" });
    }

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
    const { role, userId } = getAuth(req);

    if (role !== "freelancer") {
      return res.status(403).json({ success: false, error: "Freelancer access required" });
    }

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
    const { role, userId } = getAuth(req);
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    if (role !== "freelancer" || contract.freelancerId !== userId) {
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

    if (!(isAdminRole(role) || role === "client" || role === "employer")) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
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

    if (!(isAdminRole(role) || role === "client" || role === "employer")) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    if (!isAdminRole(role) && contract.clientId !== userId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const entriesToPay = await prisma.timeEntry.findMany({
      where: {
        contractId,
        status: { in: ["APPROVED", "PENDING"] }
      }
    });

    let totalPaid = 0;
    for (const e of entriesToPay) {
      totalPaid += Number(e.earnings || 0);
    }

    await prisma.timeEntry.updateMany({
      where: {
        contractId,
        status: { in: ["APPROVED", "PENDING"] }
      },
      data: { status: "PAID" }
    });

    return res.json({ success: true, data: { amount: totalPaid } });
  } catch (err: any) {
    console.error("payContractDue error:", err);
    return res.status(500).json({ success: false, error: "Failed to pay contract due" });
  }
};
