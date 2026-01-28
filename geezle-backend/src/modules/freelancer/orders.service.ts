import { EVENTS } from '../../realtime/events';
import { emitToUser } from '../../realtime/socket';

export class OrdersService {
  static io: any;

  static injectIO(io: any) {
    OrdersService.io = io;
  }

  static async listForFreelancer(opts: { userId: string; page: number; limit: number; status?: string }) {
    // placeholder: implement real DB queries
    const items = [
      { id: 'order-1', freelancerId: opts.userId, clientId: 'client-1', status: 'OPEN' },
    ];
    return { items, total: 1 };
  }

  static async markOrderCompleted(orderId: string, actorId: string) {
    const order = { id: orderId, freelancerId: 'F1', clientId: 'C1', status: 'COMPLETED' };
    if (OrdersService.io) {
      emitToUser(OrdersService.io, order.freelancerId, EVENTS.ORDER_UPDATED, order);
      emitToUser(OrdersService.io, order.clientId, EVENTS.ORDER_UPDATED, order);
    }
    return order;
  }
}

export default OrdersService;
