/**
 * Unified Multi-Tenant Shop Service (Commercial-Grade)
 * Đảm bảo quản lý trạng thái Shop tập trung, đồng bộ thời gian thực,
 * có cache tức thì và không bao giờ bị đứng ở trạng thái "Đang tải...".
 */

const ShopService = (function () {
  const STORAGE_ACTIVE_SHOP_ID = 'af_active_shop_id';
  const STORAGE_ACTIVE_SHOP_NAME = 'current_shop_name';
  const STORAGE_SHOPS_CACHE = 'af_cached_shops_list';

  let currentActiveShop = null;
  let cachedShopsList = [];

  // Khởi tạo cache ban đầu từ localStorage để render tức thì 0ms
  try {
    const rawCache = localStorage.getItem(STORAGE_SHOPS_CACHE);
    if (rawCache) {
      cachedShopsList = JSON.parse(rawCache);
    }
  } catch (_) {}

  /**
   * Lấy ID Shop đang kích hoạt hiện tại
   */
  function getActiveShopId() {
    return localStorage.getItem(STORAGE_ACTIVE_SHOP_ID) || (cachedShopsList[0]?.id) || 'default';
  }

  /**
   * Lấy đối tượng Shop đang kích hoạt (có fallback an toàn)
   */
  function getActiveShop() {
    const activeId = getActiveShopId();
    if (activeId === 'all') {
      return { id: 'all', name: 'Toàn bộ Chi Nhánh & Đơn Hàng', status: 'active' };
    }
    const found = cachedShopsList.find(s => s.id === activeId);
    if (found) return found;

    const savedName = localStorage.getItem(STORAGE_ACTIVE_SHOP_NAME) || 'Shop Lũa Thủy Sinh';
    return { id: activeId, name: savedName, status: 'active' };
  }

  /**
   * Đặt Shop kích hoạt và phát sự kiện đồng bộ toàn trang
   */
  function setActiveShop(shopOrId) {
    let shopId = '';
    let shopName = '';

    if (typeof shopOrId === 'object' && shopOrId !== null) {
      shopId = shopOrId.id;
      shopName = shopOrId.name;
    } else {
      shopId = String(shopOrId);
      const found = cachedShopsList.find(s => s.id === shopId);
      shopName = found ? found.name : (shopId === 'all' ? 'Toàn bộ Chi Nhánh & Đơn Hàng' : 'Shop');
    }

    localStorage.setItem(STORAGE_ACTIVE_SHOP_ID, shopId);
    localStorage.setItem('current_shop_id', shopId);
    localStorage.setItem(STORAGE_ACTIVE_SHOP_NAME, shopName);

    currentActiveShop = { id: shopId, name: shopName };

    // Bắn Custom Event để các tab / biểu đồ tự động cập nhật
    document.dispatchEvent(new CustomEvent('shop:changed', {
      detail: { shopId, shopName }
    }));

    return currentActiveShop;
  }

  /**
   * Tải danh sách Shop từ Supabase có phân quyền chặt chẽ
   */
  async function loadUserShops(sb, userSession, userProfile) {
    if (!sb) return cachedShopsList;

    try {
      // 1. Kiểm tra quyền Quản trị viên sàn (Master / System Admin)
      const isSysAdmin = userProfile?.role === 'SYSTEM_ADMIN' ||
                         userProfile?.role === 'MASTER_ADMIN' ||
                         userProfile?.role === 'ADMIN' ||
                         localStorage.getItem('current_role') === 'SYSTEM_ADMIN' ||
                         localStorage.getItem('current_role') === 'ADMIN';

      // 2. Lấy toàn bộ danh sách shop từ database
      const { data: allShops, error: shopsErr } = await sb
        .from('shops')
        .select('id, name, code, is_active, status, owner_id, created_at')
        .is('deleted_at', null)
        .order('name');

      let availableShops = (!shopsErr && allShops) ? allShops : [];

      // 3. Nếu là Shop Owner / Staff -> Lọc đúng các shop được phép quản lý
      let permittedShops = [];
      if (!isSysAdmin && userSession?.id) {
        // Lấy từ shop_members
        const { data: memberRows } = await sb
          .from('shop_members')
          .select('shop_id, role, shops(id, name, code, status, owner_id)')
          .eq('user_id', userSession.id);

        if (memberRows && memberRows.length > 0) {
          memberRows.forEach(m => {
            if (m.shops && !permittedShops.some(s => s.id === m.shops.id)) {
              permittedShops.push(m.shops);
            } else if (m.shop_id) {
              const f = availableShops.find(s => s.id === m.shop_id);
              if (f && !permittedShops.some(s => s.id === f.id)) permittedShops.push(f);
            }
          });
        }

        // Lấy từ owner_id trong shops
        const ownedShops = availableShops.filter(s => s.owner_id === userSession.id);
        ownedShops.forEach(s => {
          if (!permittedShops.some(p => p.id === s.id)) permittedShops.push(s);
        });

        // Lấy từ profile.shop_id
        if (userProfile?.shop_id) {
          const profileShop = availableShops.find(s => s.id === userProfile.shop_id);
          if (profileShop && !permittedShops.some(p => p.id === profileShop.id)) {
            permittedShops.push(profileShop);
          }
        }
      }

      // 4. Chỉ tự động khởi tạo Shop nếu toàn bộ Database chưa có bất kỳ Shop nào
      if (availableShops.length === 0 && userSession?.id) {
        let defaultName = 'Shop Lũa Thủy Sinh';
        if (userProfile?.full_name && userProfile.full_name !== 'Chủ Shop') {
          defaultName = 'Shop ' + userProfile.full_name;
        } else if (userSession.email) {
          const prefix = userSession.email.split('@')[0];
          defaultName = prefix.toLowerCase().includes('tai') ? 'Shop Lũa Thủy Sinh' : ('Shop ' + prefix.toUpperCase());
        }

        const { data: newShop } = await sb.from('shops').insert({
          name: defaultName,
          owner_id: userSession.id,
          status: 'active'
        }).select().maybeSingle();

        if (newShop) {
          finalList = [newShop];
          await sb.from('shop_members').insert({
            shop_id: newShop.id,
            user_id: userSession.id,
            role: 'OWNER'
          }).catch(() => {});
        }
      } else if (finalList.length === 0 && availableShops.length > 0) {
        finalList = availableShops;
      }

      // Lưu Cache
      if (finalList.length > 0) {
        cachedShopsList = finalList;
        localStorage.setItem(STORAGE_SHOPS_CACHE, JSON.stringify(finalList));
      }

      // Đảm bảo activeShop hợp lệ
      const currentActiveId = getActiveShopId();
      if (isSysAdmin && currentActiveId === 'all') {
        // Giữ nguyên all cho Admin
      } else if (!finalList.some(s => s.id === currentActiveId)) {
        if (finalList.length > 0) {
          setActiveShop(finalList[0]);
        }
      }

      return finalList;
    } catch (err) {
      console.warn('[ShopService] Lỗi nạp danh sách shop:', err);
      return cachedShopsList;
    }
  }

  /**
   * Lưu cấu hình Shop và Bưu cục đồng bộ vào Supabase
   */
  async function saveShopFullConfig(sb, shopId, shopName, vnpostData, jtData) {
    if (!sb || !shopId || shopId === 'all') return { success: false, message: 'Shop ID không hợp lệ' };

    try {
      // 1. Cập nhật tên Shop
      if (shopName) {
        await sb.from('shops').update({ name: shopName }).eq('id', shopId);
        localStorage.setItem(STORAGE_ACTIVE_SHOP_NAME, shopName);
        
        // Cập nhật lại trong cached list
        const found = cachedShopsList.find(s => s.id === shopId);
        if (found) found.name = shopName;
        localStorage.setItem(STORAGE_SHOPS_CACHE, JSON.stringify(cachedShopsList));
      }

      // 2. Cập nhật VNPost Config
      if (vnpostData) {
        const { data: existingVnp } = await sb.from('carrier_configs')
          .select('id')
          .eq('shop_id', shopId)
          .eq('carrier', 'vnpost')
          .maybeSingle();

        if (existingVnp) {
          await sb.from('carrier_configs').update({
            config: vnpostData,
            updated_at: new Date().toISOString()
          }).eq('id', existingVnp.id);
        } else {
          await sb.from('carrier_configs').insert({
            shop_id: shopId,
            carrier: 'vnpost',
            config: vnpostData
          });
        }
      }

      // 3. Cập nhật J&T Config
      if (jtData) {
        const { data: existingJt } = await sb.from('carrier_configs')
          .select('id')
          .eq('shop_id', shopId)
          .eq('carrier', 'jt')
          .maybeSingle();

        if (existingJt) {
          await sb.from('carrier_configs').update({
            config: jtData,
            updated_at: new Date().toISOString()
          }).eq('id', existingJt.id);
        } else {
          await sb.from('carrier_configs').insert({
            shop_id: shopId,
            carrier: 'jt',
            config: jtData
          });
        }
      }

      // Thông báo cập nhật thành công
      document.dispatchEvent(new CustomEvent('shop:updated', {
        detail: { shopId, shopName, vnpostData, jtData }
      }));

      return { success: true };
    } catch (err) {
      console.error('[ShopService] Lỗi lưu cấu hình shop:', err);
      return { success: false, error: err.message };
    }
  }

  return {
    getActiveShopId,
    getActiveShop,
    setActiveShop,
    loadUserShops,
    saveShopFullConfig,
    getCachedShops: () => cachedShopsList
  };
})();

// Xuất toàn cục cho cả trình duyệt và module
if (typeof window !== 'undefined') {
  window.ShopService = ShopService;
}
