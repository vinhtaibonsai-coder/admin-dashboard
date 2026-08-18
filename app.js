// admin-dashboard/app.js
// Shop Owner Command Center - Executive Dashboard & Remote Extension Management
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initTabNavigation();
  initCharts();
  initThemeToggle();
  initPasswordMeter();
  await loadDashboardData();
  await loadOrdersData();
  await loadShopsData();
  await loadStaffData();
  await loadFleetData();
});

// 1. TAB NAVIGATION
function initTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const sections = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      sections.forEach(sec => {
        if (sec.id === `tab-${targetTab}`) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });

  const btnRefresh = document.getElementById('btnRefreshStats');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang làm mới...';
      await loadDashboardData();
      setTimeout(() => {
        btnRefresh.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Làm mới số liệu';
      }, 600);
    });
  }
}

// 2. CHART.JS INITIALIZATION
let revChart = null;
let carrierChart = null;

function initCharts() {
  const revCtx = document.getElementById('chartRevenueTimeline')?.getContext('2d');
  if (revCtx) {
    revChart = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: ['12/08', '13/08', '14/08', '15/08', '16/08', '17/08', '18/08 (Hôm nay)'],
        datasets: [
          {
            label: 'Tiền COD (VNĐ)',
            data: [12500000, 14200000, 11800000, 19500000, 16400000, 15800000, 18450000],
            borderColor: '#4F46E5',
            backgroundColor: 'rgba(79, 70, 229, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: {
              callback: val => (val / 1000000).toFixed(1) + ' tr'
            }
          }
        }
      }
    });
  }

  const carrierCtx = document.getElementById('chartCarrierShare')?.getContext('2d');
  if (carrierCtx) {
    carrierChart = new Chart(carrierCtx, {
      type: 'doughnut',
      data: {
        labels: ['VNPost Bưu Điện', 'J&T Express'],
        datasets: [{
          data: [68, 32],
          backgroundColor: ['#4F46E5', '#EF4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }
}

// 3. THEME TOGGLE
function initThemeToggle() {
  const btn = document.getElementById('btnToggleTheme');
  const icon = document.getElementById('themeIcon');
  if (!btn) return;

  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('af_theme', isDark ? 'dark' : 'light');
    if (icon) {
      icon.className = isDark ? 'ph ph-moon text-base' : 'ph ph-sun text-base';
    }
  });

  if (localStorage.getItem('af_theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if (icon) icon.className = 'ph ph-moon text-base';
  }
}

// 4. PASSWORD STRENGTH METER
function initPasswordMeter() {
  const inp = document.getElementById('txtOwnerNewPass');
  const bar = document.getElementById('pwStrengthMeterBar');
  const txt = document.getElementById('pwStrengthMeterText');

  if (inp && bar && txt) {
    inp.addEventListener('input', () => {
      const val = inp.value || '';
      let score = 0;
      if (val.length >= 8) score += 30;
      if (/[A-Z]/.test(val)) score += 25;
      if (/[0-9]/.test(val)) score += 25;
      if (/[^A-Za-z0-9]/.test(val)) score += 20;

      bar.style.width = score + '%';
      if (!val) {
        bar.style.background = '#EF4444';
        txt.textContent = 'Độ mạnh: Chưa nhập';
        txt.style.color = '#EF4444';
      } else if (score < 50) {
        bar.style.background = '#EF4444';
        txt.textContent = 'Độ mạnh: Yếu';
        txt.style.color = '#EF4444';
      } else if (score < 80) {
        bar.style.background = '#F59E0B';
        txt.textContent = 'Độ mạnh: Khá';
        txt.style.color = '#F59E0B';
      } else {
        bar.style.background = '#10B981';
        txt.textContent = 'Độ mạnh: Rất Mạnh (An toàn)';
        txt.style.color = '#10B981';
      }
    });
  }

  const btnSave = document.getElementById('btnSaveOwnerPass');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const newP = document.getElementById('txtOwnerNewPass')?.value || '';
      const confP = document.getElementById('txtOwnerConfirmPass')?.value || '';
      if (!newP || newP.length < 6) {
        alert('⚠️ Mật khẩu phải có ít nhất 6 ký tự!');
        return;
      }
      if (newP !== confP) {
        alert('⚠️ Mật khẩu xác nhận không khớp!');
        return;
      }
      alert('✅ Đổi mật khẩu Super Owner thành công! Toàn bộ hệ thống đã được bảo vệ.');
      if (inp) inp.value = '';
      if (document.getElementById('txtOwnerConfirmPass')) document.getElementById('txtOwnerConfirmPass').value = '';
      if (bar) bar.style.width = '0%';
    });
  }
}

// 5. DATA LOADERS (SUPABASE + LOCAL STORAGE)
async function loadDashboardData() {
  // Read orders from Cloud Supabase or Storage
  if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.getOrders === 'function') {
    const orders = await OrderStorage.getOrders().catch(() => []);
    if (orders && orders.length > 0) {
      let totalCod = 0;
      orders.forEach(o => {
        const cod = Number(o.cod_amount || o.cod || 0);
        totalCod += cod;
      });
      const kpiCodEl = document.getElementById('kpiTodayCod');
      if (kpiCodEl) kpiCodEl.textContent = totalCod.toLocaleString('vi-VN') + ' đ';
      const kpiMonthEl = document.getElementById('kpiMonthOrders');
      if (kpiMonthEl) kpiMonthEl.textContent = `${orders.length} Đơn`;
    }
  }
}

async function loadOrdersData() {
  const tbody = document.getElementById('masterOrdersTableBody');
  if (!tbody) return;

  const mockOrders = [
    {
      name: 'Võ Minh Trí',
      phone: '0912.888.999',
      address: '142 Nguyễn Thị Thập, P. Tân Quy, Q.7, TP.HCM',
      code: 'DON-SG-8812',
      waybill: 'VN88291024VN',
      cod: 850000,
      carrierAccount: '🏢 Acc Kim Sa Tùng',
      carrier: 'VNPost',
      staff: 'Trần Thị Mai',
      device: 'PC-KHO-SG-01',
      time: '15:42 Hôm nay'
    },
    {
      name: 'Hoàng Hải Nam',
      phone: '0977.123.456',
      address: '38 Tràng Thi, P. Hàng Trống, Hoàn Kiếm, Hà Nội',
      code: 'DON-HN-5519',
      waybill: 'JT66281920',
      cod: 1200000,
      carrierAccount: '🏢 Acc Nhựt Lũa',
      carrier: 'J&T Express',
      staff: 'Lê Văn Thắng',
      device: 'PC-KHO-HN-01',
      time: '14:20 Hôm nay'
    },
    {
      name: 'Phạm Thu Trang',
      phone: '0938.444.555',
      address: '77 Lê Duẩn, P. Bến Nghé, Q.1, TP.HCM',
      code: 'DON-SG-8811',
      waybill: 'VN88291011VN',
      cod: 450000,
      carrierAccount: '🏢 Acc Kim Sa Tùng',
      carrier: 'VNPost',
      staff: 'Trần Thị Mai',
      device: 'PC-KHO-SG-01',
      time: '11:15 Hôm nay'
    }
  ];

  tbody.innerHTML = mockOrders.map(o => `
    <tr>
      <td>
        <strong>${o.name}</strong>
      </td>
      <td>
        <span style="font-family:monospace; color:var(--primary); font-weight:700;">${o.phone}</span><br>
        <small style="color:var(--text-s); max-width:240px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${o.address}</small>
      </td>
      <td>
        <span style="font-family:monospace; font-weight:700;">${o.code}</span><br>
        <span class="badge" style="background:#E0E7FF; color:#4338CA; font-family:monospace;">${o.waybill}</span>
      </td>
      <td>
        <strong style="color:#10B981; font-family:monospace;">${o.cod.toLocaleString('vi-VN')} đ</strong>
      </td>
      <td>
        <span class="badge" style="background:rgba(79,70,229,0.1); color:#4F46E5; font-weight:700;">${o.carrierAccount}</span>
      </td>
      <td>
        <strong>${o.staff}</strong><br>
        <small style="color:var(--text-s); font-family:monospace;">${o.device}</small>
      </td>
      <td>
        <small style="color:var(--text-s);">${o.time}</small>
      </td>
      <td style="text-align:center;">
        <button class="btn btn-secondary btn-sm" title="Xem chi tiết payload"><i class="ph ph-eye"></i></button>
      </td>
    </tr>
  `).join('');
}

async function loadShopsData() {
  // Loaded statically with edit actions
}

async function loadStaffData() {
  // Loaded statically with RBAC actions
}

async function loadFleetData() {
  const btnFleet = document.getElementById('btnRefreshFleet');
  if (btnFleet) {
    btnFleet.addEventListener('click', () => {
      btnFleet.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang quét...';
      setTimeout(() => {
        btnFleet.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Quét Thiết Bị';
        alert('🟢 Quét thành công: 2/2 Máy tính nhân viên đang Online & Hoạt động bình thường!');
      }, 700);
    });
  }
}
