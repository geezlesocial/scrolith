import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';

const ensureUserId = (req: Request) => req.user?.id as string | undefined;

const mapCartItem = (item: any) => {
  const isJob = item?.itemType === 'JOB' || Boolean(item?.jobId);
  const gig = item?.gig;
  const job = item?.job;
  const image = isJob
    ? ''
    : gig?.image || (Array.isArray(gig?.images) ? gig.images[0] : '') || '';
  const parsedJobBudget = isJob
    ? Number.parseFloat(String(job?.budget || '').replace(/[^\d.]/g, ''))
    : 0;
  const safePrice = isJob
    ? (Number.isFinite(parsedJobBudget) ? parsedJobBudget : 0)
    : (typeof gig?.price === 'number' ? gig.price : Number(gig?.price ?? 0));
  return {
    id: item.id,
    item_type: isJob ? 'job' : 'gig',
    itemType: isJob ? 'job' : 'gig',
    gig_id: item.gigId,
    gigId: item.gigId,
    job_id: item.jobId,
    jobId: item.jobId,
    title: isJob ? (job?.title || '') : (gig?.title || ''),
    price: safePrice,
    budget: isJob ? (job?.budget || '') : '',
    type: isJob ? (job?.type ? String(job.type).toLowerCase() : '') : '',
    image,
    quantity: item.quantity ?? 1,
    freelancer_id: isJob ? undefined : gig?.userId,
    freelancerId: isJob ? undefined : gig?.userId,
    freelancer_name: isJob ? undefined : (gig?.user?.name || 'Freelancer'),
    freelancerName: isJob ? undefined : (gig?.user?.name || 'Freelancer'),
    client_id: isJob ? job?.clientId : undefined,
    clientId: isJob ? job?.clientId : undefined,
    client_name: isJob ? (job?.client?.name || 'Client') : undefined,
    clientName: isJob ? (job?.client?.name || 'Client') : undefined,
    rating: isJob ? 0 : (gig?.rating ?? 0),
    reviews: isJob ? 0 : (gig?.reviewCount ?? 0),
    added_at: item.createdAt ? item.createdAt.toISOString() : new Date().toISOString(),
    addedAt: item.createdAt ? item.createdAt.toISOString() : new Date().toISOString()
  };
};

const summarizeCart = (cart: any) => {
  const items = Array.isArray(cart?.items) ? cart.items.map(mapCartItem) : [];
  const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const totalItems = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
  return {
    id: cart?.id,
    user_id: cart?.userId,
    userId: cart?.userId,
    items,
    subtotal,
    total_items: totalItems,
    totalItems,
    updated_at: cart?.updatedAt ? cart.updatedAt.toISOString() : undefined,
    updatedAt: cart?.updatedAt ? cart.updatedAt.toISOString() : undefined
  };
};

const getCartWithItems = async (userId: string) => {
  return prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { createdAt: 'desc' },
        include: {
          gig: { include: { user: { select: { id: true, name: true, avatar: true } } } },
          job: { include: { client: { select: { id: true, name: true, avatar: true } } } }
        }
      }
    }
  });
};

export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    let cart = await getCartWithItems(userId);
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              gig: { include: { user: { select: { id: true, name: true, avatar: true } } } },
              job: { include: { client: { select: { id: true, name: true, avatar: true } } } }
            }
          }
        }
      });
    }

    return res.json({ success: true, data: summarizeCart(cart) });
  } catch (error: any) {
    console.error('Get cart error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load cart' });
  }
};

export const addCartItem = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gigId = (req.body?.gig_id || req.body?.gigId || '').toString();
    const jobId = (req.body?.job_id || req.body?.jobId || '').toString();
    const qtyRaw = Number(req.body?.quantity ?? 1);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

    if (!gigId && !jobId) {
      return res.status(400).json({ success: false, error: 'gigId or jobId is required' });
    }
    if (gigId && jobId) {
      return res.status(400).json({ success: false, error: 'Provide either gigId or jobId, not both' });
    }

    if (gigId) {
      const gig = await prisma.gig.findUnique({ where: { id: gigId } });
      if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
      if (gig.isActive === false || gig.adminStatus !== 'APPROVED' || gig.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, error: 'This gig is not available for purchase.' });
      }
    }

    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
      if (String(job.status) !== 'ACTIVE' || !job.isActive || !job.isVisible) {
        return res.status(400).json({ success: false, error: 'This job is not currently available.' });
      }
    }

    const cart = await prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {}
    });

    if (gigId) {
      await prisma.cartItem.upsert({
        where: { cartId_gigId: { cartId: cart.id, gigId } },
        create: { cartId: cart.id, itemType: 'GIG', gigId, quantity },
        update: { quantity: { increment: quantity } }
      });
    } else {
      await prisma.cartItem.upsert({
        where: { cartId_jobId: { cartId: cart.id, jobId } },
        create: { cartId: cart.id, itemType: 'JOB', jobId, quantity },
        update: { quantity: { increment: quantity } }
      });
    }

    const updated = await getCartWithItems(userId);
    realtime.emitToUser(userId, 'cart:updated', summarizeCart(updated));
    return res.json({ success: true, data: summarizeCart(updated) });
  } catch (error: any) {
    console.error('Add cart item error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to add to cart' });
  }
};

export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const itemId = req.params.id;
    const qtyRaw = Number(req.body?.quantity);
    const quantity = Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : NaN;

    if (!itemId) return res.status(400).json({ success: false, error: 'Cart item id is required' });
    if (!quantity || quantity < 1) return res.status(400).json({ success: false, error: 'Quantity must be at least 1' });

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } }
    });
    if (!item) return res.status(404).json({ success: false, error: 'Cart item not found' });

    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });

    const updated = await getCartWithItems(userId);
    realtime.emitToUser(userId, 'cart:updated', summarizeCart(updated));
    return res.json({ success: true, data: summarizeCart(updated) });
  } catch (error: any) {
    console.error('Update cart item error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update cart item' });
  }
};

export const removeCartItem = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const itemId = req.params.id;
    const gigId = (req.body?.gig_id || req.body?.gigId || '').toString();
    const jobId = (req.body?.job_id || req.body?.jobId || '').toString();

    if (!itemId && !gigId && !jobId) {
      return res.status(400).json({ success: false, error: 'Cart item id, gigId, or jobId is required' });
    }

    if (itemId) {
      await prisma.cartItem.deleteMany({ where: { id: itemId, cart: { userId } } });
    } else if (gigId) {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id, gigId } });
      }
    } else if (jobId) {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id, jobId } });
      }
    }

    const updated = await getCartWithItems(userId);
    realtime.emitToUser(userId, 'cart:updated', summarizeCart(updated));
    return res.json({ success: true, data: summarizeCart(updated) });
  } catch (error: any) {
    console.error('Remove cart item error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to remove cart item' });
  }
};

export const clearCart = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    const updated = await getCartWithItems(userId);
    realtime.emitToUser(userId, 'cart:updated', summarizeCart(updated));
    return res.json({ success: true, data: summarizeCart(updated) });
  } catch (error: any) {
    console.error('Clear cart error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to clear cart' });
  }
};

export const listCartsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string | undefined) || undefined;
    const carts = await prisma.cart.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            gig: { select: { id: true, title: true, price: true } },
            job: { select: { id: true, title: true, budget: true, status: true } }
          }
        }
      }
    });

    const data = carts.map((cart) => ({
      id: cart.id,
      user_id: cart.userId,
      userId: cart.userId,
      user: cart.user,
      items_count: cart.items.length,
      total_items: cart.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
      subtotal: cart.items.reduce((sum, item) => {
        if (item.gig) return sum + (Number(item.gig?.price ?? 0) * (item.quantity || 0));
        const parsedBudget = Number.parseFloat(String(item.job?.budget || '').replace(/[^\d.]/g, ''));
        return sum + ((Number.isFinite(parsedBudget) ? parsedBudget : 0) * (item.quantity || 0));
      }, 0),
      updated_at: cart.updatedAt.toISOString()
    }));

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Admin list carts error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load carts' });
  }
};

export const getCartAdmin = async (req: Request, res: Response) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            gig: { include: { user: { select: { id: true, name: true, avatar: true } } } },
            job: { include: { client: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      }
    });

    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });

    return res.json({
      success: true,
      data: {
        ...summarizeCart(cart),
        user: cart.user
      }
    });
  } catch (error: any) {
    console.error('Admin get cart error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load cart' });
  }
};

export const deleteCartAdmin = async (req: Request, res: Response) => {
  try {
    await prisma.cart.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Admin delete cart error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete cart' });
  }
};

export const removeCartItemAdmin = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.itemId;
    await prisma.cartItem.delete({ where: { id: itemId } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Admin delete cart item error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete cart item' });
  }
};
