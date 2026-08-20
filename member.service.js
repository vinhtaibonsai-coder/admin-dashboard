// =========================================================================
// MEMBER.SERVICE.JS — DỊCH VỤ QUẢN LÝ THÀNH VIÊN SHOP (MEMBER SERVICE)
// =========================================================================

const MemberService = {
  async getShopMembers(shopId) {
    if (!shopId) {
      const activeShop = typeof ShopService !== 'undefined' ? await ShopService.getActiveShop() : null;
      if (!activeShop) return [];
      shopId = activeShop.id;
    }

    // Nếu shopId không phải UUID hợp lệ (ví dụ 'shop_default') -> Trả về fallback local
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId);
    if (!isUuid) {
      return [
        { id: 'mem_owner', shop_id: shopId, role: 'SHOP_OWNER', role_id: '88888888-8888-8888-8888-888888888888', profiles: { username: 'yen_admin', full_name: 'Chủ Shop' } }
      ];
    }

    try {
      const { url, anonKey } = typeof AuthService !== 'undefined'
        ? await AuthService._getSupabaseUrlAndKey()
        : { url: '', anonKey: '' };

      if (url && anonKey) {
        const endpoint = `${url.replace(/\/$/, '')}/rest/v1/shop_members?shop_id=eq.${shopId}&select=*,profiles(*)`;
        const resp = await fetch(endpoint, {
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        });
        if (resp.ok) {
          return await resp.json();
        }
      }
    } catch (e) {
      console.warn('[MemberService] Lỗi getShopMembers:', e);
    }

    // Mock fallback danh sách nhân viên local
    return [
      { id: 'mem_1', role: 'SHOP_OWNER', status: 'active', profiles: { full_name: 'Chủ Shop (Bạn)', email: 'owner@system.com' } }
    ];
  },

  async addMember(shopId, userId, role = 'SHOP_STAFF', permissions = []) {
    try {
      const { url, anonKey } = typeof AuthService !== 'undefined'
        ? await AuthService._getSupabaseUrlAndKey()
        : { url: '', anonKey: '' };

      if (url && anonKey) {
        const endpoint = `${url.replace(/\/$/, '')}/rest/v1/shop_members`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            shop_id: shopId,
            user_id: userId,
            role,
            status: 'active'
          })
        });
        if (resp.ok) {
          return await resp.json();
        }
      }
    } catch (e) {
      console.error('[MemberService] Lỗi addMember:', e);
    }
    return null;
  },

  async removeMember(memberId) {
    try {
      const { url, anonKey } = typeof AuthService !== 'undefined'
        ? await AuthService._getSupabaseUrlAndKey()
        : { url: '', anonKey: '' };

      if (url && anonKey) {
        const endpoint = `${url.replace(/\/$/, '')}/rest/v1/shop_members?id=eq.${memberId}`;
        const resp = await fetch(endpoint, {
          method: 'DELETE',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        });
        return resp.ok;
      }
    } catch (e) {
      console.error('[MemberService] Lỗi removeMember:', e);
    }
    return false;
  }
};

globalThis.MemberService = MemberService;
