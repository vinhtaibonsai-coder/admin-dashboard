// =========================================================================
// ORDERS.SERVICE.JS — DỊCH VỤ QUẢN LÝ ĐƠN HÀNG (ORDER SERVICE)
// =========================================================================

const OrderService = {
  // Gom các bản ghi cùng 1 đơn hàng (trước & sau khi bưu điện cấp mã tracking)
  deduplicateOrders(orders) {
    if (!Array.isArray(orders)) return [];
    const uniqueMap = new Map();

    for (const order of orders) {
      if (!order) continue;
      const phone = String(order.phone || '').replace(/\D/g, '');
      const name = (order.name || order.customer_name || '').trim().toLowerCase();
      const code = (order.order_code || '').trim().toLowerCase();
      const timeKey = order.submitted_at ? new Date(order.submitted_at).toISOString().slice(0, 16) : 'notime';

      const key = code && code !== '—' ? `code_${code}` : `np_${phone}_${name}_${timeKey}`;

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { ...order });
      } else {
        const existing = uniqueMap.get(key);
        if (!existing.tracking_code && order.tracking_code) {
          existing.tracking_code = order.tracking_code;
        }
        if (!existing.order_code && order.order_code) {
          existing.order_code = order.order_code;
        }
        if (!existing.cod_amount && order.cod_amount) {
          existing.cod_amount = order.cod_amount;
        }
        if (!existing.carrier_account && order.carrier_account) {
          existing.carrier_account = order.carrier_account;
        }
        if (!existing.device_name && order.device_name) {
          existing.device_name = order.device_name;
        }
      }
    }

    return Array.from(uniqueMap.values());
  },

  // Tải danh sách đơn đã lên hệ thống vận chuyển
  async fetchSubmittedOrders(sb, limit = 1000) {
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('submitted_orders')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return this.deduplicateOrders(data || []);
    } catch (err) {
      console.error('[OrderService] Lỗi fetchSubmittedOrders:', err);
      return [];
    }
  },

  // Tải danh sách đơn nháp (orders)
  async fetchDraftOrders(sb, limit = 500) {
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[OrderService] Lỗi fetchDraftOrders:', err);
      return [];
    }
  },

  // Xoá đơn nháp khỏi Supabase
  async deleteDraftOrder(sb, orderId) {
    if (!sb || !orderId) return false;
    try {
      const { error } = await sb
        .from('orders')
        .delete()
        .eq('id', orderId);
      return !error;
    } catch (err) {
      console.error('[OrderService] Lỗi deleteDraftOrder:', err);
      return false;
    }
  },

  // Xoá đơn đã lên khỏi Supabase
  async deleteSubmittedOrder(sb, orderId) {
    if (!sb || !orderId) return false;
    try {
      const { error } = await sb
        .from('submitted_orders')
        .delete()
        .eq('id', orderId);
      return !error;
    } catch (err) {
      console.error('[OrderService] Lỗi deleteSubmittedOrder:', err);
      return false;
    }
  }
};

globalThis.OrderService = OrderService;
