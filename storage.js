(() => {
  const configCache = {
    groqApiKey: "",
    groqModelName: "llama-3.3-70b-versatile",
    customAiPrompt: "",
    blacklistPhones: []
  };

  // Lắng nghe thay đổi từ chrome.storage để tự động đồng bộ cache
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        for (const key in changes) {
          if (key in configCache) {
            configCache[key] = changes[key].newValue;
          }
        }
        // Khi orders thay đổi từ context khác (options page), invalidate cache ngay
        if (changes.savedOrders || changes.submittedOrders) {
          OrderStorage._invalidateOrdersCache();
        }
      }
    });
  }

  function _timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout sau ${ms}ms`)), ms));
  }

  const OrderStorage = {
    isExtensionAvailable() {
      try {
        return typeof chrome !== 'undefined' && 
               chrome.runtime && 
               chrome.runtime.id && 
               chrome.storage && 
               chrome.storage.local && 
               !!chrome.runtime.getManifest();
      } catch (e) {
        return false;
      }
    },

    async initCache() {
      return new Promise((resolve) => {
        if (this.isExtensionAvailable()) {
          chrome.storage.local.get(['groqApiKey', 'groqModelName', 'customAiPrompt', 'blacklistPhones'], (res) => {
            if (res.groqApiKey !== undefined) configCache.groqApiKey = res.groqApiKey;
            if (res.groqModelName !== undefined) configCache.groqModelName = res.groqModelName;
            if (res.customAiPrompt !== undefined) configCache.customAiPrompt = res.customAiPrompt;
            if (res.blacklistPhones !== undefined) configCache.blacklistPhones = res.blacklistPhones;
            resolve();
          });
        } else {
          configCache.groqApiKey = localStorage.getItem('groqApiKey') || "";
          configCache.groqModelName = localStorage.getItem('groqModelName') || "llama-3.3-70b-versatile";
          configCache.customAiPrompt = localStorage.getItem('customAiPrompt') || "";
          try {
            const bl = localStorage.getItem('blacklistPhones');
            configCache.blacklistPhones = bl ? JSON.parse(bl) : [];
          } catch (e) {}
          resolve();
        }
      });
    },

    getCacheValue(key) {
      return configCache[key];
    },

    // ─── IN-MEMORY CACHE cho orders (tránh đọc storage lặp lại) ─────────────
    _ordersCache: null,
    _ordersCacheTime: 0,
    _CACHE_TTL: 30000, // 30 giây — đủ để UI mượt, đủ mới để không stale

    _invalidateOrdersCache() {
      this._ordersCache = null;
      this._ordersCacheTime = 0;
    },

    getOrders() {
      // Trả về từ cache nếu còn mới (< 30s)
      if (this._ordersCache !== null && (Date.now() - this._ordersCacheTime) < this._CACHE_TTL) {
        return Promise.resolve(this._ordersCache);
      }
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.get(['savedOrders'], (result) => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.error('Lỗi khi lấy đơn hàng:', chrome.runtime.lastError);
                resolve([]);
              } else {
                const orders = result.savedOrders || [];
                // Lưu vào cache
                this._ordersCache = orders;
                this._ordersCacheTime = Date.now();
                resolve(orders);
              }
            });
          } else {
            const localData = localStorage.getItem('savedOrders');
            const orders = localData ? JSON.parse(localData) : [];
            this._ordersCache = orders;
            this._ordersCacheTime = Date.now();
            resolve(orders);
          }
        } catch (e) {
          console.error('Không thể truy cập bộ lưu trữ:', e);
          resolve([]);
        }
      });
    },


    async saveOrder(order) {
      // Luôn đọc fresh từ storage để tránh cache stale từ context khác
      this._invalidateOrdersCache();
      const orders = await this.getOrders();
      if (!order.deviceName) {
        if (typeof FirebaseCloud !== 'undefined') {
          const cn = FirebaseCloud.deviceName;
          if (cn && cn !== 'Máy không tên' && !cn.startsWith('dev_')) {
            order.deviceName = cn;
          }
        }
        // Fallback: đọc trực tiếp từ storage nếu cloud chưa đồng bộ
        if (!order.deviceName && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            const r = await new Promise(res => chrome.storage.local.get(['fbDeviceName'], res));
            if (r.fbDeviceName && r.fbDeviceName !== 'Máy không tên' && !r.fbDeviceName.startsWith('dev_')) {
              order.deviceName = r.fbDeviceName;
            }
          } catch(_) {}
        }
      }
      
      // Bắt buộc lấy Shop ID từ Session an toàn (Zero Trust)
      if (typeof AuthSession !== 'undefined') {
        try {
          const activeShopId = await AuthSession.getActiveShop();
          if (activeShopId) {
            order.shopId = activeShopId;
          }
        } catch (_) {}
      }

      if (!order.createdAt || order.createdAt.length <= 10) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        order.createdAt = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      }
      
      const existing = orders.find(o => {
        if (order.id && o.id === order.id) return false;
        if (order.orderCode && o.orderCode && order.orderCode.trim().toLowerCase() === o.orderCode.trim().toLowerCase()) return true;
        const nameMatch = (order.name || '').trim().toLowerCase() === (o.name || '').trim().toLowerCase();
        const phoneMatch = (order.phone || '').replace(/\D/g, '') === (o.phone || '').replace(/\D/g, '');
        const codMatch = Number(order.codAmount) === Number(o.codAmount);
        return nameMatch && phoneMatch && codMatch;
      });

      if (existing) {
        order.id = existing.id;
        if (!order.createdAt) order.createdAt = existing.createdAt;
      }

      if (!order.id) {
        order.id = 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        orders.unshift(order);
      } else {
        const index = orders.findIndex(o => o.id === order.id);
        if (index !== -1) {
          orders[index] = { ...orders[index], ...order };
        } else {
          orders.unshift(order);
        }
      }

      // Giới hạn lưu trữ cục bộ tối đa 1000 đơn hàng gần nhất để tăng tốc độ xử lý
      if (orders.length > 1000) {
        orders.sort((a,b) => {
          const tA = Number(a.id?.split('_')[1]) || 0;
          const tB = Number(b.id?.split('_')[1]) || 0;
          return tB - tA;
        });
        orders = orders.slice(0, 1000);
      }

      return new Promise((resolve, reject) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ savedOrders: orders }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.error('Lỗi khi lưu đơn hàng:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                this._invalidateOrdersCache(); // cache cũ không còn hợp lệ
                resolve(order);
                this._pushToCloud(order);
              }
            });
          } else {
            localStorage.setItem('savedOrders', JSON.stringify(orders));
            this._invalidateOrdersCache();
            resolve(order);
            this._pushToCloud(order);
          }
        } catch (e) {
          reject(e);
        }
      });
    },

    async _deleteFromCloud(id) {
      if (!id) return;
      try {
        if (this.isExtensionAvailable()) {
          chrome.runtime.sendMessage({ action: 'deleteOrderCloud', id: String(id) }, () => {});
        } else {
          const c = this._cloud();
          if (c) {
            if (typeof c.deleteOrder === 'function') await c.deleteOrder(id).catch(() => {});
            if (typeof c.deleteOrderCloud === 'function') await c.deleteOrderCloud(id).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Lỗi xóa đơn trên cloud:', e);
      }
    },

    async deleteOrder(id) {
      if (!id) return false;
      const orders = await this.getOrders();
      const strId = String(id);
      const filteredOrders = orders.filter(o => o && String(o.id) !== strId && String(o.savedOrderId || '') !== strId);
      
      this._deleteFromCloud(id).catch(() => {});

      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ savedOrders: filteredOrders }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.error('Lỗi khi xóa đơn hàng:', chrome.runtime.lastError);
                resolve(false);
              } else {
                this._invalidateOrdersCache();
                resolve(true);
              }
            });
          } else {
            localStorage.setItem('savedOrders', JSON.stringify(filteredOrders));
            this._invalidateOrdersCache();
            resolve(true);
          }
        } catch (e) {
          console.error('Lỗi khi xóa đơn nháp:', e);
          resolve(false);
        }
      });
    },

    clearAll() {
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.remove(['savedOrders'], () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.error('Lỗi khi xóa toàn bộ đơn hàng:', chrome.runtime.lastError);
                resolve(false);
              } else {
                this._invalidateOrdersCache();
                resolve(true);
              }
            });
          } else {
            localStorage.removeItem('savedOrders');
            this._invalidateOrdersCache();
            resolve(true);
          }
        } catch (e) {
          console.error(e);
          resolve(false);
        }
      });
    },

    async _getCustomerMetadataKey() {
      let userId = 'default_user';
      let shopId = 'default_shop';
      if (typeof AuthSession !== 'undefined') {
        try {
          const u = await AuthSession.getUser();
          if (u && u.id) userId = String(u.id);
          const s = await AuthSession.getActiveShop();
          if (s) shopId = String(s.id || s);
        } catch(_) {}
      }
      return `customerMetadata_${userId}_${shopId}`;
    },

    async getCustomerMetadata() {
      const key = await this._getCustomerMetadataKey();
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.get([key], (result) => {
              resolve(result[key] || {});
            });
          } else {
            const data = localStorage.getItem(key);
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch (e) {
              resolve({});
            }
          }
        } catch (e) {
          resolve({});
        }
      });
    },

    saveCustomerMetadata(phone, metadata) {
      return new Promise(async (resolve, reject) => {
        try {
          const key = await this._getCustomerMetadataKey();
          if (typeof phone === 'object' && phone !== null && !metadata) {
            const fullMap = phone;
            if (this.isExtensionAvailable()) {
              chrome.storage.local.set({ [key]: fullMap }, () => resolve(fullMap));
            } else {
              localStorage.setItem(key, JSON.stringify(fullMap));
              resolve(fullMap);
            }
            return;
          }

          const cleanPhone = String(phone || '').replace(/\D/g, '');
          if (!cleanPhone) { resolve({}); return; }
          const allMeta = await this.getCustomerMetadata();
          allMeta[cleanPhone] = { ...allMeta[cleanPhone], ...metadata };
          
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [key]: allMeta }, () => {
              resolve(allMeta[cleanPhone]);
              this._pushCustomerToCloud(cleanPhone, allMeta[cleanPhone]);
            });
          } else {
            localStorage.setItem(key, JSON.stringify(allMeta));
            resolve(allMeta[cleanPhone]);
            this._pushCustomerToCloud(cleanPhone, allMeta[cleanPhone]);
          }
        } catch (e) {
          reject(e);
        }
      });
    },

    async _pushCustomerToCloud(phone, meta) {
      try {
        if (typeof FirebaseCloud !== 'undefined' && FirebaseCloud.isConnected) {
          if (typeof FirebaseCloud.pushCustomerMetadata === 'function') {
            await FirebaseCloud.pushCustomerMetadata(phone, meta);
          }
        }
      } catch (e) {
        console.warn('Lỗi push customer metadata lên cloud:', e);
      }
    },

    async deleteBulkOrders(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return { success: 0, failed: 0 };
      const orders = await this.getOrders();
      const strIds = ids.map(id => String(id));
      const filteredOrders = orders.filter(o => o && !strIds.includes(String(o.id)) && !strIds.includes(String(o.savedOrderId || '')));
      
      try {
        if (this.isExtensionAvailable()) {
          chrome.runtime.sendMessage({ action: 'deleteBulkOrdersCloud', ids: strIds });
        }
      } catch (_) {}

      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ savedOrders: filteredOrders }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.error('Lỗi khi xóa hàng loạt đơn hàng:', chrome.runtime.lastError);
                resolve({ success: 0, failed: ids.length });
              } else {
                this._invalidateOrdersCache();
                resolve({ success: ids.length, failed: 0 });
              }
            });
          } else {
            localStorage.setItem('savedOrders', JSON.stringify(filteredOrders));
            this._invalidateOrdersCache();
            resolve({ success: ids.length, failed: 0 });
          }
        } catch (e) {
          console.error(e);
          resolve({ success: 0, failed: ids.length });
        }
      });
    },

    _cloud() {
      if (typeof SupabaseCloud !== 'undefined') {
        return SupabaseCloud;
      }
      return null;
    },

    async _pushToCloud(order) {
      try {
        if (this.isExtensionAvailable()) {
          chrome.runtime.sendMessage({ action: 'pushOrder', order });
        } else {
          const c = this._cloud();
          if (c) await c.pushOrder(order);
        }
      } catch (e) { console.warn('Cloud push error:', e); }
    },

    async _deleteFromCloud(id) {
      try {
        if (this.isExtensionAvailable()) {
          return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'deleteOrder', orderId: id }, () => {
              const err = chrome.runtime.lastError;
              resolve(!err);
            });
          });
        } else {
          const c = this._cloud();
          if (c) await c.deleteOrder(id);
        }
      } catch (e) { console.warn('Cloud delete error:', e); }
    },

    async syncToCloud() {
      const orders = await this.getOrders();
      try {
        if (this.isExtensionAvailable()) {
          return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'syncToCloud', orders }, (res) => {
              const err = chrome.runtime.lastError;
              resolve(res || { ok: false, reason: err?.message || 'Connection lost' });
            });
          });
        } else {
          const c = this._cloud();
          if (!c) return { ok: false, reason: 'Firebase chưa được cấu hình' };
          await c.pushOrders(orders);
          const apiKey = configCache.groqApiKey;
          if (apiKey) await c.pushApiKey(apiKey);
          return { ok: true, count: orders.length };
        }
      } catch (e) {
        console.error('Sync to cloud error:', e);
        return { ok: false, reason: e.message };
      }
    },

    async syncFromCloud() {
      try {
        if (this.isExtensionAvailable()) {
          return Promise.race([
            new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'syncFromCloud' }, async (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                  resolve({ ok: false, reason: lastErr.message });
                  return;
                }
                if (!response || !response.ok) {
                  resolve({ ok: false, reason: response?.reason || 'Lỗi bất ngờ' });
                  return;
                }
                
                // Đồng bộ customer metadata nếu có
                if (response.customerMetadata) {
                  const localMeta = await this.getCustomerMetadata();
                  const mergedMeta = { ...localMeta, ...response.customerMetadata };
                  chrome.storage.local.set({ customerMetadata: mergedMeta });
                }

                const cloudOrders = response.orders || [];
                const localOrders = await this.getOrders();
                const localMap = new Map(localOrders.map(o => [o.id, o]));
                cloudOrders.forEach(o => { if (!localMap.has(o.id)) localMap.set(o.id, o); });
                let merged = Array.from(localMap.values());
                merged.sort((a,b) => {
                  const tA = Number(a.id?.split('_')[1]) || 0;
                  const tB = Number(b.id?.split('_')[1]) || 0;
                  return tB - tA;
                });
                if (merged.length > 1000) {
                  merged = merged.slice(0, 1000);
                }
                chrome.storage.local.set({ savedOrders: merged }, () => {
                  resolve({ ok: true, count: merged.length - localOrders.length });
                });
              });
            }),
            _timeout(15000)
          ]);
        } else {
          const c = this._cloud();
          if (!c) return { ok: false, reason: 'Firebase chưa được cấu hình' };
          
          const [cloudOrders, cloudMeta] = await Promise.race([
            Promise.all([c.fetchOrders(), c.fetchCustomersMetadata()]),
            _timeout(15000)
          ]);

          if (cloudMeta) {
            const localMeta = await this.getCustomerMetadata();
            const mergedMeta = { ...localMeta, ...cloudMeta };
            localStorage.setItem('customerMetadata', JSON.stringify(mergedMeta));
          }

          if (!Array.isArray(cloudOrders) || cloudOrders.length === 0) return { ok: true, count: 0 };

          const localOrders = await this.getOrders();
          const localMap = new Map(localOrders.map(o => [o.id, o]));
          cloudOrders.forEach(o => { if (!localMap.has(o.id)) localMap.set(o.id, o); });
          let merged = Array.from(localMap.values());
          merged.sort((a,b) => {
            const tA = Number(a.id?.split('_')[1]) || 0;
            const tB = Number(b.id?.split('_')[1]) || 0;
            return tB - tA;
          });
          if (merged.length > 1000) {
            merged = merged.slice(0, 1000);
          }
          localStorage.setItem('savedOrders', JSON.stringify(merged));
          return { ok: true, count: merged.length - localOrders.length };
        }
      } catch (e) {
        console.error('Sync from cloud error:', e);
        return { ok: false, reason: e.message };
      }
    },

    async syncApiKeyFromCloud() {
      try {
        if (this.isExtensionAvailable()) {
          return Promise.race([
            new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'fetchApiKey' }, (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                  resolve(null);
                  return;
                }
                if (response && response.key) {
                  chrome.storage.local.set({ groqApiKey: response.key }, () => resolve(response.key));
                } else {
                  resolve(null);
                }
              });
            }),
            _timeout(10000).catch(() => null)
          ]);
        } else {
          const c = this._cloud();
          if (!c) return null;
          const key = await Promise.race([c.fetchApiKey(), _timeout(10000).catch(() => null)]);
          if (key) {
            localStorage.setItem('groqApiKey', key);
          }
          return key;
        }
      } catch (e) { console.warn('Sync API key error:', e); return null; }
    },

    async syncAllFromCloud() {
      const [keyResult, orderResult] = await Promise.allSettled([
        this.syncApiKeyFromCloud(),
        this.syncFromCloud()
      ]);
      return {
        apiKey: keyResult.status === 'fulfilled' ? keyResult.value : null,
        orders: orderResult.status === 'fulfilled' ? orderResult.value : { ok: false, reason: 'Timeout' }
      };
    },

    // ─── PARALLEL CLOUD SYNC (3 luồng độc lập, không block UI) ───────────────
    // callbacks: { onApiKeyReady(key), onOrdersReady(result), onCustomersReady(meta) }
    syncAllFromCloudParallel(callbacks = {}) {
      const { onApiKeyReady, onOrdersReady, onCustomersReady } = callbacks;

      // Luồng 1: API Key (ưu tiên cao nhất, nhẹ nhất)
      this.syncApiKeyFromCloud()
        .then(key => { if (typeof onApiKeyReady === 'function') onApiKeyReady(key); })
        .catch(e => console.warn('[Sync] API key stream error:', e));

      // Luồng 2: Orders (tách riêng khỏi customer meta)
      this._syncOrdersOnlyFromCloud()
        .then(result => { if (typeof onOrdersReady === 'function') onOrdersReady(result); })
        .catch(e => console.warn('[Sync] Orders stream error:', e));

      // Luồng 3: Customer metadata (không cần ngay, chạy sau)
      this._syncCustomerMetaOnlyFromCloud()
        .then(meta => { if (typeof onCustomersReady === 'function') onCustomersReady(meta); })
        .catch(e => console.warn('[Sync] Customer meta stream error:', e));
    },

    // Đồng bộ CHỈ orders từ cloud (tách ra để chạy song song với customer meta)
    async _syncOrdersOnlyFromCloud() {
      try {
        if (this.isExtensionAvailable()) {
          return Promise.race([
            new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'syncFromCloud' }, async (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) { resolve({ ok: false, reason: lastErr.message }); return; }
                if (!response || !response.ok) { resolve({ ok: false, reason: response?.reason || 'Lỗi bất ngờ' }); return; }

                const cloudOrders = response.orders || [];
                const localOrders = await this.getOrders();
                const localMap = new Map(localOrders.map(o => [o.id, o]));
                cloudOrders.forEach(o => { if (!localMap.has(o.id)) localMap.set(o.id, o); });
                let merged = Array.from(localMap.values());
                merged.sort((a, b) => {
                  const tA = Number(a.id?.split('_')[1]) || 0;
                  const tB = Number(b.id?.split('_')[1]) || 0;
                  return tB - tA;
                });
                if (merged.length > 1000) merged = merged.slice(0, 1000);
                chrome.storage.local.set({ savedOrders: merged }, () => {
                  this._invalidateOrdersCache(); // cloud đã ghi dữ liệu mới
                  resolve({ ok: true, count: cloudOrders.length, newCount: merged.length - localOrders.length });
                });
              });
            }),
            _timeout(15000)
          ]);
        } else {
          const c = this._cloud();
          if (!c) return { ok: false, reason: 'Firebase chưa được cấu hình' };
          const cloudOrders = await Promise.race([c.fetchOrders(), _timeout(15000)]);
          if (!Array.isArray(cloudOrders) || cloudOrders.length === 0) return { ok: true, count: 0, newCount: 0 };
          const localOrders = await this.getOrders();
          const localMap = new Map(localOrders.map(o => [o.id, o]));
          cloudOrders.forEach(o => { if (!localMap.has(o.id)) localMap.set(o.id, o); });
          let merged = Array.from(localMap.values());
          merged.sort((a, b) => (Number(b.id?.split('_')[1]) || 0) - (Number(a.id?.split('_')[1]) || 0));
          if (merged.length > 1000) merged = merged.slice(0, 1000);
          localStorage.setItem('savedOrders', JSON.stringify(merged));
          return { ok: true, count: cloudOrders.length, newCount: merged.length - localOrders.length };
        }
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    // ─── SUBMITTED ORDERS (Đơn hàng đã lên đơn) ────────────────────────────
    _submittedKey: 'submittedOrders',

    async getSubmittedOrders() {
      return new Promise((resolve) => {
        try {
          const processOrders = (rawOrders) => {
            const valid = (rawOrders || []).filter(o => {
              if (!o) return false;
              const name = (o.name || '').trim();
              const phone = (o.phone || '').replace(/\D/g, '');
              const code = (o.trackingCode || o.orderCode || '').trim();
              if ((!name || name === '—' || name === '-') && (!phone || phone === '-') && !code) return false;
              return true;
            });

            const uniqueMap = new Map();
            valid.forEach(o => {
              const key = o.trackingCode && o.trackingCode !== '—' && o.trackingCode !== '' 
                ? 'track_' + o.trackingCode 
                : (o.id || Math.random().toString());
              
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, o);
              } else {
                const existingObj = uniqueMap.get(key);
                const hasInfoNew = o.name && o.name !== '—' && o.phone && o.phone !== '-';
                const hasInfoExist = existingObj.name && existingObj.name !== '—' && existingObj.phone && existingObj.phone !== '-';
                if (hasInfoNew && !hasInfoExist) {
                  uniqueMap.set(key, { ...existingObj, ...o });
                } else {
                  uniqueMap.set(key, { ...o, ...existingObj });
                }
              }
            });

            return Array.from(uniqueMap.values());
          };

          if (this.isExtensionAvailable()) {
            chrome.storage.local.get([this._submittedKey], (result) => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                resolve([]);
              } else {
                resolve(processOrders(result[this._submittedKey]));
              }
            });
          } else {
            const data = localStorage.getItem(this._submittedKey);
            resolve(processOrders(data ? JSON.parse(data) : []));
          }
        } catch (e) {
          resolve([]);
        }
      });
    },

    async saveSubmittedOrder(order) {
      if (!order) return Promise.resolve(null);
      
      const cleanName = (order.name || '').trim();
      const cleanPhone = (order.phone || '').replace(/\D/g, '');
      const cleanTracking = (order.trackingCode || '').trim();
      const cleanOrderCode = (order.orderCode || '').trim();

      // Bỏ qua đơn rác không có cả Tên, SĐT và Mã vận đơn
      if ((!cleanName || cleanName === '—' || cleanName === '-') && (!cleanPhone || cleanPhone === '-') && !cleanTracking && !cleanOrderCode) {
        console.warn('Bỏ qua lưu đơn đã lên rác:', order);
        return Promise.resolve(null);
      }

      const orders = await this.getSubmittedOrders();

      // Gắn device name nếu chưa có
      if (!order.deviceName) {
        if (typeof FirebaseCloud !== 'undefined') {
          const cn = FirebaseCloud.deviceName;
          if (cn && cn !== 'Máy không tên' && !cn.startsWith('dev_')) {
            order.deviceName = cn;
          }
        }
        if (!order.deviceName && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            const r = await new Promise(res => chrome.storage.local.get(['fbDeviceName'], res));
            if (r.fbDeviceName && r.fbDeviceName !== 'Máy không tên' && !r.fbDeviceName.startsWith('dev_')) {
              order.deviceName = r.fbDeviceName;
            }
          } catch(_) {}
        }
      }
      // Gắn Shop thông tin nếu chưa có
      if (!order.shopId) {
        try {
          const activeShop = await this.getActiveShop();
          if (activeShop) {
            order.shopId = activeShop.id;
            order.shopName = activeShop.name;
          }
        } catch (_) {}
      }

      // Tạo ID và timestamp
      if (!order.id) {
        order.id = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }
      if (!order.submittedAt) {
        order.submittedAt = new Date().toISOString();
      }
      if (!order.submittedDate) {
        const now = new Date();
        order.submittedDate = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0');
      }

      // Kiểm tra trùng: cùng trackingCode, cùng savedOrderId, hoặc cùng name+phone
      const existing = orders.find(o => {
        if (cleanTracking && o.trackingCode && cleanTracking === String(o.trackingCode).trim()) return true;
        if (order.savedOrderId && o.savedOrderId && order.savedOrderId === o.savedOrderId) return true;
        if (order.id && o.id && order.id === o.id) return true;
        const nameMatch = cleanName && cleanName !== '—' && (o.name || '').trim().toLowerCase() === cleanName.toLowerCase();
        const phoneMatch = cleanPhone && (o.phone || '').replace(/\D/g, '') === cleanPhone;
        return nameMatch && phoneMatch;
      });

      if (existing) {
        const idx = orders.findIndex(o => o.id === existing.id || (cleanTracking && o.trackingCode === cleanTracking));
        if (idx !== -1) {
          const updatedOrder = { ...orders[idx], ...order, id: orders[idx].id };
          orders.splice(idx, 1);
          orders.unshift(updatedOrder);
        }
      } else {
        orders.unshift(order);
      }

      // Giới hạn 500 đơn gần nhất
      if (orders.length > 500) {
        orders.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        orders.length = 500;
      }

      // Tự động đẩy đơn lên cloud
      this.pushSubmittedOrderToCloud(order).catch(() => {});

      // Tự động xóa đơn tương ứng khỏi danh sách Đơn nháp (savedOrders)
      try {
        const draftOrders = await this.getOrders();
        const targetId = order.savedOrderId || order.id;
        const matchedDrafts = draftOrders.filter(s => {
          if (!s) return false;
          if (targetId && (String(s.id) === String(targetId) || String(s.savedOrderId) === String(targetId))) return true;
          if (order.orderCode && s.orderCode && String(s.orderCode).trim().toLowerCase() === String(order.orderCode).trim().toLowerCase()) return true;
          const nameMatch = (s.name || '').trim().toLowerCase() === (order.name || '').trim().toLowerCase();
          const phoneMatch = (s.phone || '').replace(/\D/g, '') === (order.phone || '').replace(/\D/g, '');
          return nameMatch && phoneMatch && nameMatch !== '';
        });

        for (const draft of matchedDrafts) {
          if (draft && draft.id) {
            await this.deleteOrder(draft.id).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Lỗi khi tự động xóa đơn nháp:', e);
      }

      return new Promise((resolve, reject) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._submittedKey]: orders }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(order);
              }
            });
          } else {
            localStorage.setItem(this._submittedKey, JSON.stringify(orders));
            resolve(order);
          }
        } catch (e) {
          reject(e);
        }
      });
    },

    async updateSubmittedOrderTracking(savedOrderId, trackingCode) {
      const orders = await this.getSubmittedOrders();
      const order = orders.find(o => o.savedOrderId === savedOrderId || o.id === savedOrderId);
      if (order) {
        order.trackingCode = trackingCode;
        this.pushSubmittedOrderToCloud(order).catch(() => {});
      }

      // Cập nhật trực tiếp các bảng `submitted_orders` và `history` trên Supabase Cloud
      try {
        if (typeof SupabaseCloud !== 'undefined' && SupabaseCloud.init) {
          const sb = SupabaseCloud.init();
          if (sb && savedOrderId) {
            // Update table submitted_orders
            await sb.from('submitted_orders').update({ tracking_code: trackingCode }).or(`id.eq.${savedOrderId},saved_order_id.eq.${savedOrderId}`);

            // Update table history
            const { data: currentRecord } = await sb.from('history').select('result').eq('id', savedOrderId).single();
            let updatePayload = { waybill_code: trackingCode };
            if (currentRecord && currentRecord.result) {
              let resObj = typeof currentRecord.result === 'string' ? JSON.parse(currentRecord.result) : currentRecord.result;
              resObj.waybillCode = trackingCode;
              updatePayload.result = resObj;
            }
            await sb.from('history').update(updatePayload).eq('id', savedOrderId);
          }
        }
      } catch (err) {
        console.warn('[updateSubmittedOrderTracking] Lỗi cập nhật Supabase:', err);
      }

      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._submittedKey]: orders }, () => {
              resolve(!(chrome.runtime && chrome.runtime.lastError));
            });
          } else {
            localStorage.setItem(this._submittedKey, JSON.stringify(orders));
            resolve(true);
          }
        } catch (e) { resolve(false); }
      });
    },

    async updateSubmittedOrderData(savedOrderId, fields) {
      const orders = await this.getSubmittedOrders();
      const order = orders.find(o => o.savedOrderId === savedOrderId || o.id === savedOrderId);
      if (order) {
        Object.assign(order, fields);
      }
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._submittedKey]: orders }, () => {
              resolve(!(chrome.runtime && chrome.runtime.lastError));
            });
          } else {
            localStorage.setItem(this._submittedKey, JSON.stringify(orders));
            resolve(true);
          }
        } catch (e) { resolve(false); }
      });
    },

    async deleteSubmittedOrder(id) {
      const orders = await this.getSubmittedOrders();
      const filtered = orders.filter(o => o.id !== id);
      try {
        if (this.isExtensionAvailable()) {
          await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'deleteSubmittedOrderCloud', orderId: id }, () => {
              const err = chrome.runtime.lastError;
              resolve(!err);
            });
          });
        }
      } catch (_) {}
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._submittedKey]: filtered }, () => {
              resolve(!(chrome.runtime && chrome.runtime.lastError));
            });
          } else {
            localStorage.setItem(this._submittedKey, JSON.stringify(filtered));
            resolve(true);
          }
        } catch (e) {
          resolve(false);
        }
      });
    },

    // ─── SHOP MANAGEMENT (QUẢN LÝ ĐA SHOP) ───────────────────────────────────
    _shopsKey: 'shopsList',
    _activeShopKey: 'activeShopId',

    async getShops() {
      return new Promise(async (resolve) => {
        try {
          let user = null;
          if (typeof AuthService !== 'undefined') {
            user = await AuthService.getCurrentUser();
          } else if (typeof AuthSession !== 'undefined') {
            user = await AuthSession.getUser();
          }

          let list = [];
          if (this.isExtensionAvailable()) {
            const res = await new Promise(res => chrome.storage.local.get([this._shopsKey], res));
            list = res[this._shopsKey] || [];
          } else {
            const raw = localStorage.getItem(this._shopsKey);
            list = raw ? JSON.parse(raw) : [];
          }

          // Khử trùng lặp và loại bỏ các shop admin rác
          if (Array.isArray(list) && list.length > 0) {
            const cleanList = [];
            const seen = new Set();
            list.forEach(s => {
              const name = (s.name || '').trim().toLowerCase();
              if (name === 'shop admin') return;
              if (!seen.has(name)) {
                seen.add(name);
                cleanList.push(s);
              }
            });
            list = cleanList;
            if (!this.isExtensionAvailable()) {
              localStorage.setItem(this._shopsKey, JSON.stringify(cleanList));
            }
          }

          // Lọc danh sách Shop chỉ thuộc về tài khoản đã đăng nhập (Shop Account)
          if (user && user.id) {
            // 1. Thử truy vấn từ Supabase nếu client đã khởi tạo
            if (typeof AuthService !== 'undefined' && typeof AuthService.getSupabaseClient === 'function') {
              const sb = AuthService.getSupabaseClient();
              if (sb) {
                try {
                  const { data: cloudShops } = await sb.from('shops')
                    .select('*')
                    .or(`owner_id.eq.${user.id}`)
                    .is('deleted_at', null);

                  if (cloudShops && cloudShops.length > 0) {
                    const formattedCloud = cloudShops.map(s => ({
                      id: s.id,
                      name: s.name,
                      owner_id: s.owner_id,
                      senderName: s.sender_name || '',
                      senderPhone: s.sender_phone || '',
                      senderAddress: s.sender_address || '',
                      senderProvince: s.sender_province || '',
                      senderDistrict: s.sender_district || '',
                      senderWard: s.sender_ward || '',
                      orderCodePrefix: s.order_code_prefix || 'DH',
                      isDefault: true,
                      createdAt: s.created_at
                    }));
                    resolve(formattedCloud);
                    return;
                  }
                } catch (_) {}
              }
            }

            // 2. Lọc trong local storage (CHỈ lấy shop có owner_id trùng khớp user.id)
            const userShops = list.filter(s => String(s.owner_id) === String(user.id) || (s.owner_email && s.owner_email === user.email));
            if (userShops.length > 0) {
              resolve(userShops);
              return;
            }

            // 3. Nếu chưa có Shop nào cho user này -> Tạo 1 Shop duy nhất gán đúng owner_id cho tài khoản
            const userDefaultShop = {
              id: 'shop_' + String(user.id).replace(/-/g, '').slice(0, 10),
              name: 'Shop ' + (user.email ? user.email.split('@')[0].toUpperCase() : 'CỦA BẠN'),
              owner_id: user.id,
              owner_email: user.email,
              senderName: '',
              senderPhone: '',
              senderAddress: '',
              senderProvince: '',
              senderDistrict: '',
              senderWard: '',
              orderCodePrefix: 'DH',
              isDefault: true,
              createdAt: new Date().toISOString()
            };

            const updatedList = [userDefaultShop, ...list.filter(s => s.owner_id && String(s.owner_id) !== String(user.id))];
            if (this.isExtensionAvailable()) {
              chrome.storage.local.set({ [this._shopsKey]: updatedList }, () => resolve([userDefaultShop]));
            } else {
              localStorage.setItem(this._shopsKey, JSON.stringify(updatedList));
              resolve([userDefaultShop]);
            }
            return;
          }

          // Trường hợp không có user đăng nhập (Offline / Unauthenticated local mode)
          if (list.length === 0) {
            const defaultShop = {
              id: 'shop_default',
              name: 'Shop Mặc Định',
              owner_id: null,
              senderName: '',
              senderPhone: '',
              senderAddress: '',
              senderProvince: '',
              senderDistrict: '',
              senderWard: '',
              orderCodePrefix: '',
              isDefault: true,
              createdAt: new Date().toISOString()
            };
            if (this.isExtensionAvailable()) {
              chrome.storage.local.set({ [this._shopsKey]: [defaultShop] }, () => resolve([defaultShop]));
            } else {
              localStorage.setItem(this._shopsKey, JSON.stringify([defaultShop]));
              resolve([defaultShop]);
            }
          } else {
            resolve(list);
          }
        } catch (e) {
          resolve([]);
        }
      });
    },

    async getActiveShop() {
      const allowedShops = await this.getShops();
      if (!allowedShops || allowedShops.length === 0) return null;

      let activeId = null;
      if (this.isExtensionAvailable()) {
        activeId = await new Promise(res => chrome.storage.local.get([this._activeShopKey], r => res(r ? r[this._activeShopKey] : null)));
      } else {
        activeId = localStorage.getItem(this._activeShopKey);
      }

      if (activeId) {
        const found = allowedShops.find(s => String(s.id) === String(activeId));
        if (found) return found;
      }

      // Tự động gán về Shop hợp lệ duy nhất/đầu tiên mà tài khoản có quyền truy cập
      const defaultShop = allowedShops.find(s => s.isDefault) || allowedShops[0];
      if (defaultShop) {
        if (this.isExtensionAvailable()) {
          chrome.storage.local.set({ [this._activeShopKey]: String(defaultShop.id) }, () => {});
        } else {
          localStorage.setItem(this._activeShopKey, String(defaultShop.id));
        }
        return defaultShop;
      }
      return null;
    },

    async setActiveShop(shopId) {
      if (!shopId) return false;
      const allowedShops = await this.getShops();
      const isAllowed = allowedShops.some(s => String(s.id) === String(shopId));
      if (!isAllowed) {
        console.warn('⚠️ Từ chối chuyển Shop: Tài khoản không có quyền truy cập Cửa hàng này!');
        return false;
      }
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._activeShopKey]: String(shopId) }, () => resolve(true));
          } else {
            localStorage.setItem(this._activeShopKey, String(shopId));
            resolve(true);
          }
        } catch (e) { resolve(false); }
      });
    },

    async saveShop(shopData) {
      if (!shopData) return null;
      let user = null;
      if (typeof AuthService !== 'undefined') {
        user = await AuthService.getCurrentUser();
      } else if (typeof AuthSession !== 'undefined') {
        user = await AuthSession.getUser();
      }
      if (user && user.id) {
        shopData.owner_id = user.id;
        shopData.owner_email = user.email;
      }

      const shops = await this.getShops();
      if (!shopData.id) {
        shopData.id = 'shop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        shopData.createdAt = new Date().toISOString();
      }
      if (shopData.isDefault) {
        shops.forEach(s => s.isDefault = false);
      }
      const idx = shops.findIndex(s => String(s.id) === String(shopData.id));
      if (idx !== -1) {
        shops[idx] = { ...shops[idx], ...shopData };
      } else {
        shops.unshift(shopData);
      }
      await new Promise(resolve => {
        if (this.isExtensionAvailable()) {
          chrome.storage.local.set({ [this._shopsKey]: shops }, () => resolve());
        } else {
          localStorage.setItem(this._shopsKey, JSON.stringify(shops));
          resolve();
        }
      });
      return shopData;
    },

    async deleteShop(shopId) {
      if (!shopId) return false;
      const shops = await this.getShops();
      if (shops.length <= 1) return false;
      const filtered = shops.filter(s => String(s.id) !== String(shopId));
      if (filtered.length > 0 && !filtered.some(s => s.isDefault)) {
        filtered[0].isDefault = true;
      }
      await new Promise(resolve => {
        if (this.isExtensionAvailable()) {
          chrome.storage.local.set({ [this._shopsKey]: filtered }, () => resolve());
        } else {
          localStorage.setItem(this._shopsKey, JSON.stringify(filtered));
          resolve();
        }
      });
      return true;
    },

    async deleteBulkSubmittedOrders(ids) {
      const orders = await this.getSubmittedOrders();
      const filtered = orders.filter(o => !ids.includes(o.id));
      try {
        if (this.isExtensionAvailable()) {
          await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'deleteBulkSubmittedOrdersCloud', ids: ids }, () => {
              const err = chrome.runtime.lastError;
              resolve(!err);
            });
          });
        }
      } catch (_) {}
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.set({ [this._submittedKey]: filtered }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                resolve({ success: 0, failed: ids.length });
              } else {
                resolve({ success: ids.length, failed: 0 });
              }
            });
          } else {
            localStorage.setItem(this._submittedKey, JSON.stringify(filtered));
            resolve({ success: ids.length, failed: 0 });
          }
        } catch (e) {
          resolve({ success: 0, failed: ids.length });
        }
      });
    },

    async clearSubmittedOrders() {
      return new Promise((resolve) => {
        try {
          if (this.isExtensionAvailable()) {
            chrome.storage.local.remove([this._submittedKey], () => {
              resolve(!(chrome.runtime && chrome.runtime.lastError));
            });
          } else {
            localStorage.removeItem(this._submittedKey);
            resolve(true);
          }
        } catch (e) {
          resolve(false);
        }
      });
    },

    // Đồng bộ CHỈ customer metadata từ cloud
    async _syncCustomerMetaOnlyFromCloud() {
      try {
        if (this.isExtensionAvailable()) {
          return Promise.race([
            new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'syncFromCloud' }, async (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) { resolve(null); return; }
                if (!response?.ok || !response.customerMetadata) { resolve(null); return; }
                const localMeta = await this.getCustomerMetadata();
                const mergedMeta = { ...localMeta, ...response.customerMetadata };
                chrome.storage.local.set({ customerMetadata: mergedMeta }, () => resolve(mergedMeta));
              });
            }),
            _timeout(15000)
          ]);
        } else {
          const c = this._cloud();
          if (!c || typeof c.fetchCustomersMetadata !== 'function') return null;
          const cloudMeta = await Promise.race([c.fetchCustomersMetadata(), _timeout(15000)]);
          if (!cloudMeta) return null;
          const localMeta = await this.getCustomerMetadata();
          const mergedMeta = { ...localMeta, ...cloudMeta };
          localStorage.setItem('customerMetadata', JSON.stringify(mergedMeta));
          return mergedMeta;
        }
      } catch (e) {
        return null;
      }
    },

    async _autoSyncCustomerFromOrder(order) {
      if (!order) return;
      try {
        const rawName = (order.name || order.customer_name || '').trim();
        const rawPhone = (order.phone || '').trim();
        const cleanPhone = rawPhone.replace(/\D/g, '');
        const key = cleanPhone ? cleanPhone : (rawName ? rawName.toLowerCase() : '');
        if (!key || key === '—' || key === '-') return;

        const meta = {
          name: rawName || 'Khách hàng',
          phone: rawPhone || '—',
          cleanPhone: cleanPhone,
          address: order.address || '—',
          note: order.note || ''
        };

        await this.saveCustomerMetadata(key, meta).catch(() => {});

        const customerObj = {
          phone: rawPhone || cleanPhone || '—',
          cleanPhone: cleanPhone,
          name: rawName || 'Khách hàng',
          address: order.address || '—',
          count: 1,
          totalCod: Number(order.codAmount || order.cod_amount || 0),
          latestDate: order.submittedAt || order.createdAt || new Date().toISOString(),
          favCarrier: order.platform || '',
          notes: order.note || ''
        };

        if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.pushCustomersCloud === 'function') {
          SupabaseCloud.pushCustomersCloud([customerObj]).catch(() => {});
        } else if (this.isExtensionAvailable()) {
          chrome.runtime.sendMessage({ action: 'pushCustomersCloud', customers: [customerObj] }, () => {});
        }
      } catch (_) {}
    },

    async pushSubmittedOrderToCloud(order) {
      if (!order) return false;
      try {
        if (this.isExtensionAvailable()) {
          return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'pushSubmittedOrder', order }, (res) => {
              const lastErr = chrome.runtime.lastError;
              resolve(res ? res.ok : false);
            });
          });
        } else {
          const c = this._cloud();
          if (!c || typeof c.pushSubmittedOrder !== 'function') return false;
          return await c.pushSubmittedOrder(order);
        }
      } catch (e) { return false; }
    },

    async syncSubmittedOrdersToCloud() {
      const orders = await this.getSubmittedOrders();
      try {
        if (this.isExtensionAvailable()) {
          return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'pushSubmittedOrders', orders }, (res) => {
              const lastErr = chrome.runtime.lastError;
              resolve({ ok: !(lastErr || (res && res.error)), count: orders.length, reason: res?.error });
            });
          });
        } else {
          const c = this._cloud();
          if (!c || typeof c.pushSubmittedOrders !== 'function') return { ok: false, reason: 'Chưa kết nối Cloud' };
          await c.pushSubmittedOrders(orders);
          return { ok: true, count: orders.length };
        }
      } catch (e) { return { ok: false, reason: e.message }; }
    },

    async syncSubmittedOrdersFromCloud() {
      try {
        const getOrderKey = (o) => {
          if (!o) return 'raw_' + Math.random();
          const code = (o.orderCode || o.order_code || '').trim().toLowerCase();
          const savedId = o.savedOrderId || o.saved_order_id || '';
          const name = (o.name || o.customer_name || '').trim().toLowerCase();
          const phone = (o.phone || '').replace(/\D/g, '');
          const id = o.id || '';
          if (code && code !== '—' && code !== '-') return 'code_' + code;
          if (savedId && savedId !== '—' && savedId !== '-') return 'saved_' + savedId;
          if (name && phone) return 'np_' + name + '_' + phone;
          if (id) return 'id_' + id;
          return 'raw_' + Math.random();
        };

        if (this.isExtensionAvailable()) {
          return Promise.race([
            new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'fetchSubmittedOrders' }, async (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) { resolve({ ok: false, reason: lastErr.message }); return; }
                const cloudOrders = Array.isArray(response) ? response : (response?.orders || []);
                const localOrders = await this.getSubmittedOrders();

                const map = new Map();
                (localOrders || []).forEach(o => { if (o) map.set(getOrderKey(o), o); });
                (cloudOrders || []).forEach(co => {
                  if (!co) return;
                  const k = getOrderKey(co);
                  if (map.has(k)) {
                    const existing = map.get(k);
                    map.set(k, { ...existing, ...co });
                  } else {
                    map.set(k, co);
                  }
                });

                let merged = Array.from(map.values());
                merged.sort((a, b) => new Date(b.submittedAt || b.submitted_at || 0) - new Date(a.submittedAt || a.submitted_at || 0));
                if (merged.length > 500) merged = merged.slice(0, 500);

                // Push merged list back to cloud to guarantee 100% cloud sync
                chrome.runtime.sendMessage({ action: 'pushSubmittedOrders', orders: merged }, () => {});

                chrome.storage.local.set({ [this._submittedKey]: merged }, () => {
                  resolve({ ok: true, count: cloudOrders.length, newCount: merged.length - localOrders.length });
                });
              });
            }),
            _timeout(15000)
          ]);
        } else {
          const c = this._cloud();
          if (!c || typeof c.fetchSubmittedOrders !== 'function') return { ok: false, reason: 'Cloud chưa được cấu hình' };
          const cloudOrders = await Promise.race([c.fetchSubmittedOrders(), _timeout(15000)]);
          const localOrders = await this.getSubmittedOrders();

          const map = new Map();
          (localOrders || []).forEach(o => { if (o) map.set(getOrderKey(o), o); });
          (Array.isArray(cloudOrders) ? cloudOrders : []).forEach(co => {
            if (!co) return;
            const k = getOrderKey(co);
            if (map.has(k)) {
              const existing = map.get(k);
              map.set(k, { ...existing, ...co });
            } else {
              map.set(k, co);
            }
          });

          let merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.submittedAt || b.submitted_at || 0) - new Date(a.submittedAt || a.submitted_at || 0));
          if (merged.length > 500) merged = merged.slice(0, 500);

          if (c && typeof c.pushSubmittedOrders === 'function') {
            c.pushSubmittedOrders(merged).catch(() => {});
          }

          localStorage.setItem(this._submittedKey, JSON.stringify(merged));
          return { ok: true, count: (cloudOrders || []).length, newCount: merged.length - localOrders.length };
        }
      } catch (e) { return { ok: false, reason: e.message }; }
    },

    async purgeAndResyncCleanState() {
      try {
        // 1. Lấy dữ liệu đơn hiện có trên Extension làm chuẩn
        const localSubmitted = await this.getSubmittedOrders();
        const cleanOrders = (typeof deduplicateSubmittedOrdersList === 'function')
          ? deduplicateSubmittedOrdersList(localSubmitted)
          : localSubmitted;

        // 2. Tải dữ liệu khách hàng từ Supabase Cloud gộp vào Extension
        let cloudHist = [];
        let cloudSub = [];
        try {
          if (this.isExtensionAvailable()) {
            [cloudHist, cloudSub] = await Promise.all([
              new Promise(res => chrome.runtime.sendMessage({ action: 'fetchHistory' }, res)),
              new Promise(res => chrome.runtime.sendMessage({ action: 'fetchSubmittedOrders' }, res))
            ]);
          }
        } catch (_) {}

        const customerMap = await this.getCustomerMetadata().catch(() => ({}));
        [...(Array.isArray(cloudHist) ? cloudHist : []), ...(Array.isArray(cloudSub) ? cloudSub : []), ...cleanOrders].forEach(o => {
          if (!o) return;
          const res = o.result || {};
          const name = o.customer_name || o.name || res.name || res.recipientName || '';
          const phone = o.phone || res.phone || res.recipientPhone || '';
          const address = o.address || res.address || res.normalizedAddress || '';
          const key = phone ? phone.trim() : name.trim().toLowerCase();
          if (key && key !== '—' && !customerMap[key]) {
            customerMap[key] = { name, phone, address, note: '' };
          }
        });
        await this.saveCustomerMetadata(customerMap).catch(() => {});

        // 3. Xóa toàn bộ dữ liệu cũ trên bảng submitted_orders của Supabase Cloud
        if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.clearSubmittedOrdersCloud === 'function') {
          await SupabaseCloud.clearSubmittedOrdersCloud();
        } else if (this.isExtensionAvailable()) {
          await new Promise(res => chrome.runtime.sendMessage({ action: 'clearSubmittedOrdersCloud' }, res));
        }

        // 4. Đẩy lại các đơn chuẩn từ Extension lên Supabase Cloud
        if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.pushSubmittedOrders === 'function') {
          await SupabaseCloud.pushSubmittedOrders(cleanOrders);
        } else if (this.isExtensionAvailable()) {
          await new Promise(res => chrome.runtime.sendMessage({ action: 'pushSubmittedOrders', orders: cleanOrders }, res));
        }

        // 5. Lưu lại danh sách đơn chuẩn vào local storage
        if (this.isExtensionAvailable()) {
          await new Promise(res => chrome.storage.local.set({ [this._submittedKey]: cleanOrders }, res));
        } else {
          localStorage.setItem(this._submittedKey, JSON.stringify(cleanOrders));
        }

        return { ok: true, count: cleanOrders.length };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    async masterResetSupabaseWithExtensionData() {
      try {
        // 1. Lấy dữ liệu 12 đơn đã lên đơn chuẩn từ Extension làm gốc
        const localSubmitted = await this.getSubmittedOrders();
        const cleanSubmitted = (typeof deduplicateSubmittedOrdersList === 'function')
          ? deduplicateSubmittedOrdersList(localSubmitted)
          : localSubmitted;

        const customerMetadataMap = await this.getCustomerMetadata().catch(() => ({}));
        const rawLocalHistory = await this.getOrders().catch(() => []);

        // 2. Làm sạch hoàn toàn Lịch sử & Khách hàng — chỉ giữ các đơn chuẩn + khách hàng hợp lệ
        const cleanCustomerMap = {};
        const cleanHistoryList = [];
        const processedKeys = new Set();

        // 2a. Đưa 12 đơn đã lên đơn chuẩn vào danh sách Khách hàng & Lịch sử
        cleanSubmitted.forEach(o => {
          if (!o) return;
          const name = (o.name || o.customer_name || '').trim();
          const phone = (o.phone || '').trim();
          const cleanPhone = phone.replace(/\D/g, '');
          const address = (o.address || '').trim();
          const key = cleanPhone ? cleanPhone : name.toLowerCase();
          
          if (key && key !== '—' && key !== '-') {
            cleanCustomerMap[key] = {
              name: name || '—',
              phone: phone || '—',
              address: address || '—',
              note: o.note || ''
            };
            if (!processedKeys.has(key)) {
              processedKeys.add(key);
              cleanHistoryList.push({
                id: o.savedOrderId || ('hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
                customer_name: name || 'Khách hàng',
                phone: phone || '',
                address: address || '',
                order_code: o.orderCode || '',
                waybill_code: o.trackingCode || o.waybillCode || '',
                cod_amount: Number(o.codAmount || 0),
                created_at: o.submittedAt || new Date().toISOString(),
                platform: o.platform || 'vnpost',
                result: { name, phone, address }
              });
            }
          }
        });

        // 2b. Bổ sung các khách hàng hợp lệ có sẵn trong metadata (ví dụ: đăng phát ( acc nhựt lũa ), Cá cảnh gò Vấp)
        Object.entries(customerMetadataMap || {}).forEach(([metaKey, metaVal]) => {
          if (!metaVal) return;
          const isPhone = /^\d+$/.test(metaKey.replace(/\D/g, '')) && metaKey.replace(/\D/g, '').length >= 8;
          const phone = isPhone ? metaKey.trim() : (metaVal.phone || '').trim();
          const cleanPhone = phone.replace(/\D/g, '');
          const rawName = metaVal.name || metaVal.customer_name || metaVal.latestName || (!isPhone ? metaKey : '') || metaVal.notes || metaVal.note || '';
          const name = String(rawName).trim();
          const key = cleanPhone ? cleanPhone : (name ? name.toLowerCase() : '');
          
          if (key && key !== '—' && key !== '-') {
            if (!cleanCustomerMap[key]) {
              cleanCustomerMap[key] = {
                name: name || '—',
                phone: phone || '—',
                address: metaVal.address || '—',
                note: metaVal.notes || metaVal.note || ''
              };
            }
          }
        });

        // 2c. Bổ sung từ rawLocalHistory nếu có khách tên hợp lệ (có họ tên rõ ràng)
        rawLocalHistory.forEach(h => {
          if (!h) return;
          const res = h.result || {};
          const name = (h.customer_name || h.name || res.name || res.recipientName || '').trim();
          const phone = (h.phone || res.phone || res.recipientPhone || '').trim();
          const cleanPhone = phone.replace(/\D/g, '');
          const key = cleanPhone ? cleanPhone : name.toLowerCase();

          if (key && key !== '—' && key !== '-' && name && name.length > 1) {
            if (!cleanCustomerMap[key]) {
              cleanCustomerMap[key] = {
                name: name,
                phone: phone || '—',
                address: h.address || res.address || '—',
                note: ''
              };
            }
            if (!processedKeys.has(key)) {
              processedKeys.add(key);
              cleanHistoryList.push({
                id: h.id || ('hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
                customer_name: name,
                phone: phone || '',
                address: h.address || res.address || '',
                cod_amount: Number(h.cod_amount || h.codAmount || 0),
                created_at: h.created_at || h.createdAt || new Date().toISOString(),
                platform: h.platform || 'vnpost',
                result: res
              });
            }
          }
        });

        // 3. Cập nhật lại bộ nhớ Extension Cục Bộ với dữ liệu đã làm sạch 100%
        await this.saveCustomerMetadata(cleanCustomerMap).catch(() => {});
        if (this.isExtensionAvailable()) {
          await new Promise(res => chrome.storage.local.set({ 
            [this._submittedKey]: cleanSubmitted
          }, res));
        } else {
          localStorage.setItem(this._submittedKey, JSON.stringify(cleanSubmitted));
        }
        this._invalidateOrdersCache();

        // 4. Xóa sạch TOÀN BỘ dữ liệu rác cũ trên Supabase Cloud (bảng submitted_orders & history)
        if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.clearAllCloudData === 'function') {
          await SupabaseCloud.clearAllCloudData();
        } else if (this.isExtensionAvailable()) {
          await new Promise(res => chrome.runtime.sendMessage({ action: 'clearAllCloudData' }, res));
        }

        // 5. Đẩy dữ liệu ĐÃ LÀM SẠCH CHUẨN từ Extension lên Supabase Cloud
        if (cleanSubmitted.length > 0) {
          if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.pushSubmittedOrders === 'function') {
            await SupabaseCloud.pushSubmittedOrders(cleanSubmitted);
          } else if (this.isExtensionAvailable()) {
            await new Promise(res => chrome.runtime.sendMessage({ action: 'pushSubmittedOrders', orders: cleanSubmitted }, res));
          }
        }

        if (cleanHistoryList.length > 0) {
          if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.pushHistory === 'function') {
            await SupabaseCloud.pushHistory(cleanHistoryList);
          } else if (this.isExtensionAvailable()) {
            await new Promise(res => chrome.runtime.sendMessage({ action: 'pushHistory', entries: cleanHistoryList }, res));
          }
        }

        const cleanCustomerList = Object.values(cleanCustomerMap);
        if (cleanCustomerList.length > 0) {
          if (typeof SupabaseCloud !== 'undefined' && typeof SupabaseCloud.pushCustomersCloud === 'function') {
            await SupabaseCloud.pushCustomersCloud(cleanCustomerList);
          } else if (this.isExtensionAvailable()) {
            await new Promise(res => chrome.runtime.sendMessage({ action: 'pushCustomersCloud', customers: cleanCustomerList }, res));
          }
        }

        const totalCustCount = cleanCustomerList.length;
        return { ok: true, submittedCount: cleanSubmitted.length, historyCount: cleanHistoryList.length, customerCount: totalCustCount };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

  };

  OrderStorage.initCache();

  globalThis.configCache = configCache;
  globalThis.OrderStorage = OrderStorage;
})();
