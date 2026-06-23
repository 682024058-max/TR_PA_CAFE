// ============================================================
// BEAN & BREW — MANAGER.JS  (Database Integration)
// API Base: http://127.0.0.1:5000/api
// Tabel: users, products, transaksi, detail_transaksi, absensi
// Penggajian: localStorage only (tidak ada endpoint di backend)
// ============================================================

const API_BASE = 'http://127.0.0.1:5000/api';

// ── Session ──────────────────────────────────────────────────
let SESSION = { id: null, nama: 'Manager', role: 'manager' };

// ── Runtime data (di-load dari API) ──────────────────────────
let MENU_ITEMS   = [];
let CATEGORIES   = [];
let CASHIERS     = [];
let TRANSACTIONS = [];
let ATTENDANCES  = [];

// ── Penggajian: Database-backed ──
let PAYROLL = [];


// ── Charts ───────────────────────────────────────────────────
let revenueChart = null;
let weeklyChart  = null;

// ── Slip gaji context ────────────────────────────────────────
let _currentSlipData = null;

// ============================================================
// API HELPERS
// ============================================================
function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-User-Role' : 'manager',
        'X-User-Id'   : SESSION.id,
        'X-User-Name' : SESSION.nama
    };
}

async function apiFetch(url, opts = {}) {
    const res  = await fetch(url, { headers: apiHeaders(), ...opts });
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'Terjadi kesalahan pada server.');
    return data;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    loadSession();
    initRealtimeClock();
    initProfileGreeting();
    initNavigationRouter();
    initMenuCRUD();
    initCategoryCRUD();
    initCashierCRUD();
    initAbsensiController();
    initReportsController();
    initPayrollController();

    // Load dashboard awal
    loadDashboardData();
    initCharts();
});

// ============================================================
// SESSION
// ============================================================
function loadSession() {
    try {
        const raw = localStorage.getItem('activeUser');
        if (raw) {
            const u    = JSON.parse(raw);
            SESSION.id   = u.id   || null;
            SESSION.nama = u.nama || 'Manager';
        }
    } catch(e) { console.error('Session load error:', e); }
}

// ============================================================
// REALTIME CLOCK
// ============================================================
function initRealtimeClock() {
    const el = document.getElementById("live-time");
    if (!el) return;
    const days   = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    function tick() {
        const now = new Date();
        el.textContent = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()} | ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
    tick(); setInterval(tick, 1000);
}

// ============================================================
// PROFILE GREETING
// ============================================================
function initProfileGreeting() {
    const u = JSON.parse(localStorage.getItem("activeUser"));
    if (!u) return;
    const nameEl = document.getElementById("active-manager-name");
    const msgEl  = document.getElementById("welcome-msg");
    if (nameEl) nameEl.textContent = u.nama;
    if (msgEl)  msgEl.textContent  = `Selamat Datang, Manager ${u.nama.split(" ")[0]}! 👋`;
}

// ============================================================
// NAVIGATION ROUTER
// ============================================================
function initNavigationRouter() {
    const navItems  = document.querySelectorAll(".nav-item");
    const views     = document.querySelectorAll(".app-view");
    const pageTitle = document.getElementById("page-title");
    const logoutBtn = document.getElementById("btn-logout-sidebar");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            navItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            views.forEach(v => {
                v.classList.remove("active");
                if (v.id === `view-${target}`) v.classList.add("active");
            });
            if (pageTitle) pageTitle.textContent = item.querySelector("span").textContent;

            // Reload data per section
            if      (target === "dashboard")           loadDashboardData();
            else if (target === "kelola-menu")         { loadCategories().then(() => loadMenuItems()); switchInnerTab('daftar-menu'); }
            else if (target === "kelola-kasir")        loadCashiers();
            else if (target === "monitoring-absensi")  loadAbsensi();
            else if (target === "penggajian")          { loadPayroll().then(() => { renderPayrollTable(); updatePayrollMetrics(); }); }
            else if (target === "laporan-penjualan")   loadTransactions();
        });
    });

    document.getElementById("view-all-tx-btn")?.addEventListener("click", () => {
        document.querySelector('[data-target="laporan-penjualan"]')?.click();
    });

    if (logoutBtn) logoutBtn.addEventListener("click", () => openModal("logout-confirm-modal"));

    document.getElementById("btn-confirm-logout")?.addEventListener("click", () => {
        localStorage.removeItem("activeUser");
        localStorage.removeItem("activeRole");
        window.location.href = "login.html";
    });
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboardData() {
    try {
        const [txData, usersData] = await Promise.all([
            apiFetch(`${API_BASE}/transaksi`),
            apiFetch(`${API_BASE}/users`)
        ]);
        TRANSACTIONS = txData.data   || [];
        CASHIERS     = (usersData.data || []).filter(u => u.role === 'kasir');

        updateDashboardMetrics();
        renderRecentTransactionsTable();
        updateCharts();
    } catch(e) {
        console.error('Dashboard load error:', e);
        showToast('Gagal memuat data dashboard: ' + e.message, 'danger');
    }
}

function updateDashboardMetrics() {
    const totalRevenue = TRANSACTIONS.reduce((s, t) => s + Number(t.total_harga || 0), 0);

    const revEl     = document.getElementById("stat-revenue");
    const txEl      = document.getElementById("stat-total-tx");
    const cashierEl = document.getElementById("stat-total-cashiers");
    const topMenuEl = document.getElementById("stat-top-menu");

    if (revEl)     revEl.textContent     = formatIDR(totalRevenue);
    if (txEl)      txEl.textContent      = TRANSACTIONS.length;
    if (cashierEl) cashierEl.textContent = CASHIERS.length;
    if (topMenuEl) { topMenuEl.textContent = '...'; loadTopMenuAllTime(topMenuEl); }
}

async function loadTopMenuAllTime(el) {
    try {
        const recent  = TRANSACTIONS.slice(0, 30);
        const details = await Promise.all(
            recent.map(tx => apiFetch(`${API_BASE}/transaksi/${tx.id_transaksi}`).catch(() => null))
        );
        const qtyMap = {};
        details.forEach(d => {
            if (!d) return;
            (d.data.items || []).forEach(item => {
                const n = item.nama_product || 'Unknown';
                qtyMap[n] = (qtyMap[n] || 0) + Number(item.qty || 1);
            });
        });
        const entries = Object.entries(qtyMap).sort((a,b) => b[1] - a[1]);
        if (el) el.textContent = entries.length ? entries[0][0] : '-';
    } catch(e) {
        if (el) el.textContent = '-';
    }
}

function renderRecentTransactionsTable() {
    const tbody = document.getElementById("recent-transactions-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const recent = TRANSACTIONS.slice(0, 5);
    if (!recent.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Belum ada data transaksi.</td></tr>`;
        return;
    }
    recent.forEach(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = Math.round(total / 1.15);
        const taxSvc = total - sub;
        const time   = (tx.tanggal_transaksi || '').slice(11, 19) || '-';
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${txId}</code></td>
            <td>${time}</td>
            <td>${tx.nama_kasir || '-'}</td>
            <td>${formatIDR(sub)}</td>
            <td>${formatIDR(taxSvc)}</td>
            <td><strong>${formatIDR(total)}</strong></td>
            <td><span class="badge ${tx.metode_pembayaran === 'Cash' ? 'badge-success' : 'badge-warning'}">${tx.metode_pembayaran || '-'}</span></td>
            <td><span class="badge badge-success">Selesai</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// CHARTS (real data dari /api/laporan/harian)
// ============================================================
function initCharts() {
    const revCtx    = document.getElementById("revenueMonthlyChart");
    const weeklyCtx = document.getElementById("weeklyTxChart");
    if (!revCtx || !weeklyCtx) return;
    if (revenueChart) revenueChart.destroy();
    if (weeklyChart)  weeklyChart.destroy();

    revenueChart = new Chart(revCtx.getContext("2d"), {
        type: "line",
        data: {
            labels: [],
            datasets: [{ label: "Omset Harian", data: [],
                borderColor: "#c68a4c", backgroundColor: "rgba(198,138,76,0.1)",
                borderWidth: 2, fill: true, tension: 0.3 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color:"#ede7de" }, ticks: { color:"#8c7a6b", callback: v => 'Rp' + (v/1000) + 'k' } },
                x: { grid: { display: false }, ticks: { color:"#8c7a6b" } }
            }
        }
    });

    weeklyChart = new Chart(weeklyCtx.getContext("2d"), {
        type: "bar",
        data: {
            labels: ["Sen","Sel","Rab","Kam","Jum","Sab","Min"],
            datasets: [{ label: "Jumlah Transaksi", data: [0,0,0,0,0,0,0],
                backgroundColor: "#3d2519", borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color:"#ede7de" }, ticks: { color:"#8c7a6b" } },
                x: { grid: { display: false }, ticks: { color:"#8c7a6b" } }
            }
        }
    });
}

async function updateCharts() {
    if (!revenueChart || !weeklyChart) return;
    try {
        const end   = new Date();
        const start = new Date(); start.setDate(start.getDate() - 6);
        const dari   = start.toISOString().slice(0, 10);
        const sampai = end.toISOString().slice(0, 10);

        const data = await apiFetch(`${API_BASE}/laporan/harian?dari=${dari}&sampai=${sampai}`);
        const rows = data.data || [];

        const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        const labels = [], revenueData = [];
        for (let i = 6; i >= 0; i--) {
            const dt  = new Date(); dt.setDate(dt.getDate() - i);
            const key = dt.toISOString().slice(0, 10);
            const row = rows.find(r => (r.tanggal || '').slice(0, 10) === key);
            labels.push(`${dt.getDate()} ${monthNames[dt.getMonth()]}`);
            revenueData.push(row ? Number(row.total_pendapatan) : 0);
        }
        revenueChart.data.labels           = labels;
        revenueChart.data.datasets[0].data = revenueData;
        revenueChart.update();

        // Bar chart: tx count by day of week from in-memory TRANSACTIONS
        const dayMap = [0,0,0,0,0,0,0];
        TRANSACTIONS.forEach(tx => {
            const d = new Date(tx.tanggal_transaksi);
            dayMap[(d.getDay() + 6) % 7]++;
        });
        weeklyChart.data.datasets[0].data = dayMap;
        weeklyChart.update();
    } catch(e) {
        console.error('Chart update error:', e);
    }
}

// ============================================================
// KELOLA MENU (Products CRUD via API)
// ============================================================
async function loadMenuItems() {
    try {
        const data = await apiFetch(`${API_BASE}/products`);
        MENU_ITEMS = (data.data || []).map(p => ({
            id       : p.id_product,
            name     : p.nama_product,
            category : p.kategori,
            price    : Number(p.harga),
            icon     : p.icon  || 'fa-mug-hot',
            warna    : p.warna || '#4e3629'
        }));
        populateMenuCategoryFilter();
        filterMenuTable();
    } catch(e) {
        showToast('Gagal memuat data menu: ' + e.message, 'danger');
    }
}

async function loadCategories() {
    try {
        const data = await apiFetch(`${API_BASE}/kategori`);
        const iconMap = {
            'coffee'    : 'fa-mug-hot',
            'non-coffee': 'fa-glass-water',
            'snack'     : 'fa-cookie',
            'dessert'   : 'fa-cake-candles'
        };
        CATEGORIES = (data.data || []).map(c => ({
            id   : c.id_kategori,
            name : c.nama_kategori,
            icon : iconMap[c.id_kategori] || 'fa-tag'
        }));
    } catch(e) {
        console.error('Gagal load kategori:', e);
    }
}

window.switchInnerTab = function(tabId) {
    document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-btn-${tabId}`)?.classList.add('active');
    document.querySelectorAll('.inner-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`inner-tab-${tabId}`)?.classList.add('active');

    if      (tabId === 'daftar-menu')     loadMenuItems();
    else if (tabId === 'kelola-kategori') { loadCategories().then(renderCategoriesTable); }
}

function populateMenuCategoryFilter() {
    const sel = document.getElementById('menu-filter-category');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Semua Kategori</option>';
    CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id; opt.textContent = cat.name;
        sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
}

function initMenuCRUD() {
    document.getElementById("btn-add-menu-modal")?.addEventListener("click", () => {
        document.getElementById("menu-form")?.reset();
        document.getElementById("menu-form-id").value = "";
        document.getElementById("menu-modal-title").textContent = "Tambah Menu Baru";
        resetMenuPhotoArea();
        if (!CATEGORIES.length) {
            loadCategories().then(() => populateMenuFormCategories());
        } else {
            populateMenuFormCategories();
        }
        openModal("menu-modal");
    });
    document.getElementById("menu-search")?.addEventListener("input", filterMenuTable);
    document.getElementById("menu-filter-category")?.addEventListener("change", filterMenuTable);
}

function populateMenuFormCategories(selectedVal) {
    const sel = document.getElementById("menu-form-category");
    if (!sel) return;
    sel.innerHTML = "";
    CATEGORIES.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.id; opt.textContent = cat.name;
        sel.appendChild(opt);
    });
    if (selectedVal) sel.value = selectedVal;
}

function resetMenuPhotoArea() {
    const preview     = document.getElementById("menu-image-preview-element");
    const placeholder = document.getElementById("menu-photo-placeholder");
    if (preview) { preview.src = ""; preview.classList.add("hidden"); }
    if (placeholder) placeholder.style.display = "flex";
    const fi = document.getElementById("menu-file-input");
    if (fi) fi.value = "";
    const imgInput = document.getElementById("menu-form-image");
    if (imgInput) imgInput.value = "";
}

window.handleMenuFileUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        const imgInput = document.getElementById("menu-form-image");
        if (imgInput) imgInput.value = dataUrl;
        const preview     = document.getElementById("menu-image-preview-element");
        const placeholder = document.getElementById("menu-photo-placeholder");
        if (preview) { preview.src = dataUrl; preview.classList.remove("hidden"); }
        if (placeholder) placeholder.style.display = "none";
    };
    reader.readAsDataURL(file);
}

function filterMenuTable() {
    const searchVal = (document.getElementById("menu-search")?.value || "").toLowerCase();
    const catVal    = document.getElementById("menu-filter-category")?.value || "all";
    const filtered  = MENU_ITEMS.filter(item => {
        const mSearch = item.name.toLowerCase().includes(searchVal);
        const mCat    = catVal === "all" || item.category === catVal;
        return mSearch && mCat;
    });
    renderMenuTable(filtered);
}

function renderMenuTable(items) {
    const tbody = document.getElementById("menu-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa-solid fa-mug-hot" style="font-size:28px;display:block;margin-bottom:8px"></i>Menu tidak ditemukan.</td></tr>`;
        return;
    }
    items.forEach(item => {
        const catObj   = CATEGORIES.find(c => c.id === item.category);
        const catLabel = catObj ? catObj.name : item.category;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="width:48px;height:48px;background:rgba(78,54,41,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#4e3629;">
                    <i class="fa-solid ${item.icon || 'fa-mug-hot'}"></i>
                </div>
            </td>
            <td><strong>${item.name}</strong></td>
            <td><span class="category-pill">${catLabel}</span></td>
            <td><strong>${formatIDR(item.price)}</strong></td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="editMenu(${item.id})" style="padding:6px 12px;font-size:11px;margin-right:6px"><i class="fa-solid fa-pencil"></i> Edit</button>
                <button class="btn-danger"    onclick="deleteMenu(${item.id})" style="padding:6px 12px;font-size:11px"><i class="fa-solid fa-trash"></i> Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editMenu = function(id) {
    const item = MENU_ITEMS.find(m => m.id === id);
    if (!item) return;
    if (!CATEGORIES.length) loadCategories().then(() => populateMenuFormCategories(item.category));
    else populateMenuFormCategories(item.category);
    document.getElementById("menu-form-id").value    = item.id;
    document.getElementById("menu-form-name").value  = item.name;
    document.getElementById("menu-form-desc").value  = "";
    document.getElementById("menu-form-price").value = item.price;
    resetMenuPhotoArea();
    document.getElementById("menu-modal-title").textContent = "Edit Menu";
    openModal("menu-modal");
}

window.deleteMenu = async function(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus menu ini?")) return;
    try {
        await apiFetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
        showToast("Menu berhasil dihapus!", "success");
        await loadMenuItems();
    } catch(e) {
        showToast("Gagal hapus menu: " + e.message, "danger");
    }
}

async function handleMenuSubmit(e) {
    e.preventDefault();
    const idVal    = document.getElementById("menu-form-id").value;
    const name     = document.getElementById("menu-form-name").value.trim();
    const category = document.getElementById("menu-form-category").value;
    const price    = parseInt(document.getElementById("menu-form-price").value);

    if (!name || !category || !price) {
        showToast("Nama, kategori, dan harga wajib diisi!", "warning"); return;
    }

    const payload = { nama_product: name, kategori: category, harga: price, icon: 'fa-mug-hot', warna: '#4e3629' };

    try {
        if (idVal) {
            await apiFetch(`${API_BASE}/products/${idVal}`, { method:'PUT', body: JSON.stringify(payload) });
            showToast("Menu berhasil diperbarui!", "success");
        } else {
            await apiFetch(`${API_BASE}/products`, { method:'POST', body: JSON.stringify(payload) });
            showToast("Menu baru berhasil ditambahkan!", "success");
        }
        closeModal("menu-modal");
        await loadMenuItems();
    } catch(e) {
        showToast("Gagal simpan menu: " + e.message, "danger");
    }
}
window.handleMenuSubmit = handleMenuSubmit;

// ============================================================
// KELOLA KATEGORI (CRUD via API)
// ============================================================
function initCategoryCRUD() {
    // Tampilkan tombol tambah
    const addBtn = document.getElementById("btn-add-category-modal");
    if (addBtn) addBtn.style.display = "";
    
    addBtn?.addEventListener("click", () => {
        document.getElementById("category-form")?.reset();
        document.getElementById("category-form-id").value = "";
        document.getElementById("category-modal-title").textContent = "Tambah Kategori Baru";
        openModal("category-modal");
    });
    
    document.getElementById("category-search")?.addEventListener("input", renderCategoriesTable);
    document.getElementById("category-form")?.addEventListener("submit", handleCategorySubmit);
}

async function handleCategorySubmit(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById("category-form-name");
    const iconInput = document.getElementById("category-form-icon");
    const name = nameInput ? nameInput.value.trim() : "";
    const icon = iconInput ? iconInput.value.trim() : "fa-tag";
    
    if (!name) {
        showToast("Nama kategori wajib diisi!", "warning");
        return;
    }
    
    try {
        const payload = {
            nama_kategori: name,
            icon: icon
        };
        await apiFetch(`${API_BASE}/kategori`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast("Kategori baru berhasil ditambahkan!", "success");
        closeModal("category-modal");
        
        await loadCategories();
        renderCategoriesTable();
        populateMenuCategoryFilter();
    } catch(e) {
        showToast("Gagal menyimpan kategori: " + e.message, "danger");
    }
}
window.handleCategorySubmit = handleCategorySubmit;


function renderCategoriesTable() {
    const tbody = document.getElementById("categories-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const searchVal = (document.getElementById("category-search")?.value || "").toLowerCase();
    const filtered  = CATEGORIES.filter(c => c.name.toLowerCase().includes(searchVal));
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Tidak ada kategori.</td></tr>`;
        return;
    }
    filtered.forEach((cat, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>CAT-${String(idx+1).padStart(3,'0')}</code></td>
            <td><strong>${cat.name}</strong></td>
            <td><code><i class="fa-solid ${cat.icon}"></i> ${cat.icon}</code></td>
            <td style="text-align:center"><span class="badge badge-success">Aktif</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// KELOLA KASIR (Users CRUD via API)
// ============================================================
async function loadCashiers() {
    try {
        const data = await apiFetch(`${API_BASE}/users`);
        CASHIERS   = (data.data || []).filter(u => u.role === 'kasir');
        renderCashierTable();
        populatePayrollCashierSelect();
    } catch(e) {
        showToast('Gagal memuat data kasir: ' + e.message, 'danger');
    }
}

function initCashierCRUD() {
    document.getElementById("btn-add-cashier-modal")?.addEventListener("click", () => {
        document.getElementById("cashier-form")?.reset();
        document.getElementById("cashier-form-id").value = "";
        document.getElementById("cashier-modal-title").textContent = "Buat Akun Kasir Baru";
        // Tampilkan field password untuk user baru
        const pwWrap = document.getElementById("cashier-password-wrapper");
        if (pwWrap) pwWrap.style.display = "";
        const pwInput = document.getElementById("cashier-form-password");
        if (pwInput) pwInput.required = true;
        openModal("cashier-modal");
    });
    document.getElementById("cashier-form")?.addEventListener("submit", handleCashierSubmit);
    document.getElementById("cashier-search")?.addEventListener("input", renderCashierTable);
}

function renderCashierTable() {
    const tbody = document.getElementById("cashier-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const searchVal = (document.getElementById("cashier-search")?.value || "").toLowerCase();
    const filtered  = CASHIERS.filter(c =>
        (c.nama || '').toLowerCase().includes(searchVal) ||
        (c.username || '').toLowerCase().includes(searchVal)
    );
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Tidak ada akun kasir terdaftar.</td></tr>`;
        return;
    }
    filtered.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${c.nama}</strong></td>
            <td><code>${c.username}</code></td>
            <td>${c.email || '-'}</td>
            <td><span class="badge ${c.status === 'aktif' ? 'badge-success' : 'badge-danger'}">${c.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
            <td>
                <button class="btn-secondary" onclick="toggleCashierStatus(${c.id_user}, '${c.status}')" style="padding:4px 10px;font-size:10px">
                    ${c.status === 'aktif' ? 'Blokir Akses' : 'Aktifkan'}
                </button>
            </td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="editCashier(${c.id_user})" style="padding:6px 12px;font-size:11px;margin-right:6px"><i class="fa-solid fa-pencil"></i> Edit</button>
                <button class="btn-danger"    onclick="deleteCashier(${c.id_user})" style="padding:6px 12px;font-size:11px"><i class="fa-solid fa-trash"></i> Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleCashierStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif';
    try {
        await apiFetch(`${API_BASE}/users/${id}`, { method:'PUT', body: JSON.stringify({ status: newStatus }) });
        showToast(`Status kasir diubah menjadi ${newStatus}!`, 'success');
        await loadCashiers();
    } catch(e) {
        showToast('Gagal ubah status: ' + e.message, 'danger');
    }
}

window.editCashier = function(id) {
    const c = CASHIERS.find(x => x.id_user === id);
    if (!c) return;
    document.getElementById("cashier-form-id").value       = c.id_user;
    document.getElementById("cashier-form-name").value     = c.nama;
    document.getElementById("cashier-form-username").value = c.username;
    document.getElementById("cashier-form-email").value    = c.email || '';
    document.getElementById("cashier-form-status").value   = c.status;
    document.getElementById("cashier-modal-title").textContent = "Edit Akun Kasir";
    // Sembunyikan field password saat edit (opsional)
    const pwWrap  = document.getElementById("cashier-password-wrapper");
    const pwInput = document.getElementById("cashier-form-password");
    if (pwWrap)  pwWrap.style.display = "none";
    if (pwInput) { pwInput.required = false; pwInput.value = ""; }
    openModal("cashier-modal");
}

window.deleteCashier = async function(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus akun kasir ini?")) return;
    try {
        await apiFetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
        showToast("Akun kasir berhasil dihapus!", "success");
        await loadCashiers();
    } catch(e) {
        showToast("Gagal hapus kasir: " + e.message, "danger");
    }
}

async function handleCashierSubmit(e) {
    e.preventDefault();
    const idVal    = document.getElementById("cashier-form-id").value;
    const nama     = document.getElementById("cashier-form-name").value.trim();
    const username = document.getElementById("cashier-form-username").value.trim();
    const email    = document.getElementById("cashier-form-email").value.trim();
    const status   = document.getElementById("cashier-form-status").value;
    const password = document.getElementById("cashier-form-password")?.value || "";

    try {
        if (idVal) {
            // Edit: password hanya dikirim jika diisi
            const payload = { nama, email, status };
            if (password) payload.password = password;
            await apiFetch(`${API_BASE}/users/${idVal}`, { method:'PUT', body: JSON.stringify(payload) });
            showToast("Akun kasir berhasil diperbarui!", "success");
        } else {
            // Baru: password wajib
            if (!password) { showToast("Password wajib diisi untuk akun baru!", "warning"); return; }
            await apiFetch(`${API_BASE}/users`, {
                method: 'POST',
                body: JSON.stringify({ nama, username, password, email, role: 'kasir' })
            });
            showToast("Akun kasir baru berhasil dibuat!", "success");
        }
        closeModal("cashier-modal");
        await loadCashiers();
    } catch(e) {
        showToast("Gagal simpan kasir: " + e.message, "danger");
    }
}

// ============================================================
// MONITORING ABSENSI (API: GET /api/absensi)
// ============================================================
async function loadAbsensi() {
    try {
        const data  = await apiFetch(`${API_BASE}/absensi`);
        ATTENDANCES = data.data || [];
        updateAbsensiMetrics();
        renderAbsensiTable();
    } catch(e) {
        showToast('Gagal memuat data absensi: ' + e.message, 'danger');
    }
}

function initAbsensiController() {
    document.getElementById("absensi-search")?.addEventListener("input", renderAbsensiTable);
    document.getElementById("absensi-filter-date")?.addEventListener("change", renderAbsensiTable);
    document.getElementById("btn-reset-absensi-filters")?.addEventListener("click", () => {
        const s = document.getElementById("absensi-search");
        const d = document.getElementById("absensi-filter-date");
        if (s) s.value = "";
        if (d) d.value = "";
        renderAbsensiTable();
    });
    document.getElementById("btn-export-absensi-pdf")?.addEventListener("click", exportAbsensiPdf);
    document.getElementById("btn-export-absensi-excel")?.addEventListener("click", exportAbsensiExcel);
}

function updateAbsensiMetrics() {
    const today = new Date().toISOString().slice(0, 10);
    let hadir = 0, terlambat = 0, aktif = 0;
    ATTENDANCES.forEach(att => {
        const attDate = (att.date || '').slice(0, 10);
        if (attDate === today) {
            hadir++;
            if ((att.status || '') === 'Terlambat') terlambat++;
            if (att.jam_masuk && !att.jam_keluar)  aktif++;
        }
    });
    const h = document.getElementById("abs-stat-hadir");
    const t = document.getElementById("abs-stat-terlambat");
    const a = document.getElementById("abs-stat-aktif");
    if (h) h.textContent = hadir;
    if (t) t.textContent = terlambat;
    if (a) a.textContent = aktif;
}

function renderAbsensiTable() {
    const tbody = document.getElementById("absensi-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const searchVal  = (document.getElementById("absensi-search")?.value || "").toLowerCase();
    const filterDate = document.getElementById("absensi-filter-date")?.value || "";
    const filtered   = ATTENDANCES.filter(att => {
        const mName = (att.nama_kasir || '').toLowerCase().includes(searchVal);
        const mDate = !filterDate || (att.date || '').slice(0,10) === filterDate;
        return mName && mDate;
    });
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Tidak ada riwayat absensi.</td></tr>`;
        return;
    }
    filtered.forEach(att => {
        const attDate = (att.date || '').slice(0, 10);
        const masuk   = att.jam_masuk  ? String(att.jam_masuk).slice(0,8)  : '-';
        const keluar  = att.jam_keluar ? String(att.jam_keluar).slice(0,8) : '-';
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${att.nama_kasir || '-'}</strong></td>
            <td>${attDate}</td>
            <td><code style="color:var(--success,#22c55e)">${masuk}</code></td>
            <td><code style="color:var(--caramel-gold,#c68a4c)">${keluar}</code></td>
            <td><span class="badge ${att.status === 'Hadir' ? 'badge-success' : 'badge-warning'}">${att.status || '-'}</span></td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="viewAbsensiDetail(${att.id_absensi})" style="padding:6px 12px;font-size:11px">
                    <i class="fa-regular fa-eye"></i> Detail
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.viewAbsensiDetail = function(id) {
    const att = ATTENDANCES.find(a => a.id_absensi === id);
    if (!att) return;
    document.getElementById("abs-detail-name").textContent   = att.nama_kasir || '-';
    document.getElementById("abs-detail-date").textContent   = (att.date || '').slice(0,10);
    document.getElementById("abs-detail-in").textContent     = att.jam_masuk  ? String(att.jam_masuk).slice(0,8)  : '-';
    document.getElementById("abs-detail-out").textContent    = att.jam_keluar ? String(att.jam_keluar).slice(0,8) : '-';
    document.getElementById("abs-detail-status").innerHTML   = `<span class="badge ${att.status === 'Hadir' ? 'badge-success' : 'badge-warning'}">${att.status || '-'}</span>`;
    openModal("absensi-detail-modal");
}

// ============================================================
// LAPORAN PENJUALAN (GET /api/transaksi + /api/transaksi/<id>)
// ============================================================
async function loadTransactions() {
    try {
        const data   = await apiFetch(`${API_BASE}/transaksi`);
        TRANSACTIONS = data.data || [];
        updateReportMetrics();
        renderReportTable();
    } catch(e) {
        showToast('Gagal memuat data transaksi: ' + e.message, 'danger');
    }
}

function initReportsController() {
    const ids = ["report-search","report-date-start","report-date-end","report-payment-method"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderReportTable);
    });
    document.getElementById("btn-reset-report-filters")?.addEventListener("click", () => {
        document.getElementById("report-search")?.["value"] !== undefined && (document.getElementById("report-search").value = "");
        document.getElementById("report-date-start") && (document.getElementById("report-date-start").value = "");
        document.getElementById("report-date-end")   && (document.getElementById("report-date-end").value   = "");
        const pm = document.getElementById("report-payment-method");
        if (pm) pm.value = "all";
        updateReportMetrics();
        renderReportTable();
    });
    document.getElementById("btn-export-pdf")?.addEventListener("click", exportReportPdf);
    document.getElementById("btn-export-excel")?.addEventListener("click", exportReportExcel);
    document.getElementById("btn-email-report")?.addEventListener("click", sendEmailReport);
}

function updateReportMetrics() {
    const total   = TRANSACTIONS.reduce((s, t) => s + Number(t.total_harga || 0), 0);
    const revEl   = document.getElementById("report-total-revenue");
    const txEl    = document.getElementById("report-total-tx-count");
    const topEl   = document.getElementById("report-top-cashier");
    if (revEl) revEl.textContent = formatIDR(total);
    if (txEl)  txEl.textContent  = TRANSACTIONS.length;
    if (topEl) {
        const cMap = {};
        TRANSACTIONS.forEach(tx => { const n = tx.nama_kasir || '-'; cMap[n] = (cMap[n]||0)+1; });
        const top = Object.entries(cMap).sort((a,b) => b[1]-a[1])[0];
        topEl.textContent = top ? top[0] : '-';
    }
}

function renderReportTable() {
    const tbody = document.getElementById("report-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const searchVal = (document.getElementById("report-search")?.value || "").toLowerCase();
    const dateStart = document.getElementById("report-date-start")?.value || "";
    const dateEnd   = document.getElementById("report-date-end")?.value   || "";
    const payMethod = document.getElementById("report-payment-method")?.value || "all";

    const filtered = TRANSACTIONS.filter(tx => {
        const txId    = `tx-${String(tx.id_transaksi).padStart(6,'0')}`;
        const cashier = (tx.nama_kasir || '').toLowerCase();
        const mSearch = txId.includes(searchVal) || cashier.includes(searchVal);
        const txDate  = (tx.tanggal_transaksi || '').slice(0, 10);
        const mStart  = !dateStart || txDate >= dateStart;
        const mEnd    = !dateEnd   || txDate <= dateEnd;
        const mMethod = payMethod === 'all' || tx.metode_pembayaran === payMethod;
        return mSearch && mStart && mEnd && mMethod;
    });

    // Update live metric untuk hasil filter
    const filteredRevenue = filtered.reduce((s,t) => s + Number(t.total_harga||0), 0);
    const revEl = document.getElementById("report-total-revenue");
    const txEl  = document.getElementById("report-total-tx-count");
    if (revEl) revEl.textContent = formatIDR(filteredRevenue);
    if (txEl)  txEl.textContent  = filtered.length;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Tidak ada data transaksi ditemukan.</td></tr>`;
        return;
    }
    filtered.forEach(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = Math.round(total / 1.15);
        const taxSvc = total - sub;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${txId}</code></td>
            <td>${dateStr}</td>
            <td>${tx.nama_kasir || '-'}</td>
            <td>${formatIDR(sub)}</td>
            <td>${formatIDR(taxSvc)}</td>
            <td><strong>${formatIDR(total)}</strong></td>
            <td><span class="badge ${tx.metode_pembayaran === 'Cash' ? 'badge-success' : 'badge-warning'}">${tx.metode_pembayaran || '-'}</span></td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="viewTransactionDetail(${tx.id_transaksi})" style="padding:6px 12px;font-size:11px">
                    <i class="fa-regular fa-eye"></i> Detail
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.viewTransactionDetail = async function(id) {
    try {
        const data  = await apiFetch(`${API_BASE}/transaksi/${id}`);
        const tx    = data.data;
        const items = tx.items || [];
        const sub   = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        const tax   = Math.round(sub * 0.10);
        const svc   = Math.round(sub * 0.05);
        const txId  = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const dateStr = (tx.tanggal_transaksi || '').slice(0,19).replace('T',' ');

        document.getElementById("tx-detail-id").textContent         = txId;
        document.getElementById("tx-detail-date").textContent       = dateStr;
        document.getElementById("tx-detail-cashier").textContent    = tx.nama_kasir || '-';
        document.getElementById("tx-detail-method").textContent     = tx.metode_pembayaran || '-';
        document.getElementById("tx-detail-subtotal").textContent   = formatIDR(sub);
        document.getElementById("tx-detail-tax").textContent        = formatIDR(tax);
        document.getElementById("tx-detail-service").textContent    = formatIDR(svc);
        document.getElementById("tx-detail-grand-total").textContent = formatIDR(Number(tx.total_harga));

        const tbody = document.getElementById("tx-detail-items-tbody");
        if (tbody) {
            tbody.innerHTML = "";
            items.forEach(item => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${item.nama_product || '-'}</strong></td>
                    <td style="text-align:right">${formatIDR(Number(item.harga_satuan || 0))}</td>
                    <td style="text-align:center">${item.qty}</td>
                    <td style="text-align:right"><strong>${formatIDR(Number(item.subtotal || 0))}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        }
        openModal("tx-detail-modal");
    } catch(e) {
        showToast("Gagal load detail transaksi: " + e.message, "danger");
    }
}

// ============================================================
// PENGGAJIAN (Database-backed CRUD)
// ============================================================
async function loadPayroll() {
    try {
        const data = await apiFetch(`${API_BASE}/payroll`);
        PAYROLL = data.data || [];
    } catch(e) {
        showToast('Gagal memuat data penggajian: ' + e.message, 'danger');
    }
}

function initPayrollController() {
    const addBtn      = document.getElementById("btn-add-payroll-modal");
    const search      = document.getElementById("payroll-search");
    const filterMonth = document.getElementById("payroll-filter-month");
    const resetBtn    = document.getElementById("btn-reset-payroll-filters");
    const exportBtn   = document.getElementById("btn-export-payroll-excel");

    const shiftsInput = document.getElementById("payroll-form-shifts");
    if (shiftsInput) {
        shiftsInput.readOnly = true;
    }

    if (addBtn) {
        addBtn.addEventListener("click", () => {
            document.getElementById("payroll-form")?.reset();
            document.getElementById("payroll-form-id").value = "";
            document.getElementById("payroll-modal-title").textContent = "Tambah Data Gaji Kasir";
            document.getElementById("payroll-total-display").textContent = "Rp 0";
            const rateEl = document.getElementById("payroll-form-rate");
            if (rateEl) rateEl.value = 75000;
            populatePayrollCashierSelect();
            openModal("payroll-modal");
        });
    }
    
    document.getElementById("payroll-form-cashier")?.addEventListener("change", triggerAutoCalculateShifts);
    document.getElementById("payroll-form-period")?.addEventListener("change", triggerAutoCalculateShifts);

    if (search)      search.addEventListener("input", renderPayrollTable);
    if (filterMonth) filterMonth.addEventListener("change", renderPayrollTable);
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (search) search.value = "";
            if (filterMonth) filterMonth.value = "";
            renderPayrollTable(); updatePayrollMetrics();
        });
    }
    if (exportBtn) exportBtn.addEventListener("click", exportPayrollExcel);
}

async function triggerAutoCalculateShifts() {
    const cashier = document.getElementById("payroll-form-cashier")?.value;
    const period  = document.getElementById("payroll-form-period")?.value;
    const shiftsInput = document.getElementById("payroll-form-shifts");
    
    if (!cashier || !period) return;
    
    if (shiftsInput) {
        shiftsInput.value = "";
        shiftsInput.placeholder = "Menghitung...";
    }
    
    try {
        const res = await apiFetch(`${API_BASE}/payroll/calculate-shifts?cashier=${encodeURIComponent(cashier)}&period=${period}`);
        if (shiftsInput) {
            shiftsInput.value = res.total_shifts || 0;
            shiftsInput.placeholder = "Contoh: 22";
            recalcPayroll();
        }
    } catch (e) {
        console.error(e);
        showToast("Gagal menghitung shift otomatis: " + e.message, "danger");
        if (shiftsInput) {
            shiftsInput.placeholder = "Gagal memuat";
        }
    }
}

function populatePayrollCashierSelect() {
    const sel = document.getElementById("payroll-form-cashier");
    if (!sel) return;
    sel.innerHTML = "";
    CASHIERS.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.nama; opt.textContent = c.nama;
        sel.appendChild(opt);
    });
}

window.recalcPayroll = function() {
    const rate   = parseInt(document.getElementById("payroll-form-rate")?.value)   || 0;
    const shifts = parseInt(document.getElementById("payroll-form-shifts")?.value) || 0;
    const el = document.getElementById("payroll-total-display");
    if (el) el.textContent = formatIDR(rate * shifts);
}

function updatePayrollMetrics() {
    let totalAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    const uniqueCashiers = new Set();
    PAYROLL.forEach(p => {
        totalAmount += p.totalSalary;
        uniqueCashiers.add(p.cashier);
        if (p.buktiTF) {
            paidCount++;
        } else {
            unpaidCount++;
        }
    });
    const tEl = document.getElementById("payroll-stat-total");
    const cEl = document.getElementById("payroll-stat-count");
    const pEl = document.getElementById("payroll-stat-paid");
    const uEl = document.getElementById("payroll-stat-unpaid");
    if (tEl) tEl.textContent = formatIDR(totalAmount);
    if (cEl) cEl.textContent = uniqueCashiers.size;
    if (pEl) pEl.textContent = paidCount;
    if (uEl) uEl.textContent = unpaidCount;
}

function renderPayrollTable() {
    const tbody = document.getElementById("payroll-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const searchVal   = (document.getElementById("payroll-search")?.value   || "").toLowerCase();
    const filterMonth = document.getElementById("payroll-filter-month")?.value || "";
    const filtered    = PAYROLL.filter(p =>
        (p.cashier || '').toLowerCase().includes(searchVal) &&
        (filterMonth === "" || p.period === filterMonth)
    );
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Tidak ada data penggajian ditemukan.</td></tr>`;
        return;
    }
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    filtered.forEach(p => {
        const [yr, mo] = p.period.split("-");
        const periodLabel = `${months[parseInt(mo)-1]} ${yr}`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${p.cashier}</strong></td>
            <td>${periodLabel}</td>
            <td>${formatIDR(p.ratePerShift || 75000)}</td>
            <td style="text-align:center"><strong>${p.totalShifts || 0}</strong> shift</td>
            <td><strong>${formatIDR(p.totalSalary)}</strong></td>
            <td style="text-align:center">
                <button class="btn-secondary"  onclick="editPayroll(${p.id})"     style="padding:6px 10px;font-size:11px;margin-right:4px"><i class="fa-solid fa-pencil"></i> Edit</button>
                <button class="btn-slip-send"  onclick="openSlipGaji(${p.id})"   style="margin-right:4px"><i class="fa-solid fa-envelope"></i> Kirim</button>
                <button class="btn-danger"     onclick="deletePayroll(${p.id})"  style="padding:6px 10px;font-size:11px"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    updatePayrollMetrics();
}

window.editPayroll = function(id) {
    const p = PAYROLL.find(x => x.id === id);
    if (!p) return;
    populatePayrollCashierSelect();
    document.getElementById("payroll-form-id").value       = p.id;
    document.getElementById("payroll-form-cashier").value  = p.cashier;
    document.getElementById("payroll-form-period").value   = p.period;
    document.getElementById("payroll-form-rate").value     = p.ratePerShift || 75000;
    document.getElementById("payroll-form-shifts").value   = p.totalShifts || 0;
    document.getElementById("payroll-total-display").textContent = formatIDR(p.totalSalary);
    document.getElementById("payroll-modal-title").textContent   = "Edit Data Gaji Kasir";
    openModal("payroll-modal");
}

window.deletePayroll = async function(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus data penggajian ini?")) return;
    try {
        await apiFetch(`${API_BASE}/payroll/${id}`, { method: 'DELETE' });
        showToast("Data penggajian berhasil dihapus!", "success");
        await loadPayroll();
        renderPayrollTable();
    } catch(e) {
        showToast("Gagal menghapus data penggajian: " + e.message, "danger");
    }
}

async function handlePayrollSubmit(e) {
    e.preventDefault();
    const idVal       = document.getElementById("payroll-form-id").value;
    const cashier     = document.getElementById("payroll-form-cashier").value;
    const period      = document.getElementById("payroll-form-period").value;
    const ratePerShift = parseInt(document.getElementById("payroll-form-rate").value)   || 75000;
    const totalShifts  = parseInt(document.getElementById("payroll-form-shifts").value) || 0;
    const totalSalary  = ratePerShift * totalShifts;
    
    const payload = { cashier, period, ratePerShift, totalShifts, totalSalary };
    
    try {
        if (idVal) {
            await apiFetch(`${API_BASE}/payroll/${idVal}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast("Data penggajian berhasil diperbarui!", "success");
        } else {
            await apiFetch(`${API_BASE}/payroll`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast("Data penggajian baru berhasil ditambahkan!", "success");
        }
        closeModal("payroll-modal");
        await loadPayroll();
        renderPayrollTable();
    } catch(e) {
        showToast("Gagal menyimpan data penggajian: " + e.message, "danger");
    }
}
window.handlePayrollSubmit = handlePayrollSubmit;

// ============================================================
// SLIP GAJI & KIRIM EMAIL
// ============================================================
window.openSlipGaji = function(id) {
    const p = PAYROLL.find(x => x.id === id);
    if (!p) return;
    const cashierObj   = CASHIERS.find(c => c.nama === p.cashier);
    const cashierEmail = cashierObj?.email || "(email tidak terdaftar)";
    const [yr, mo]     = p.period.split("-");
    const months       = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const periodLabel  = `${months[parseInt(mo)-1]} ${yr}`;
    const issuedDate   = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });

    document.getElementById("slip-cashier-name").textContent  = p.cashier;
    document.getElementById("slip-cashier-email").textContent = cashierEmail;
    document.getElementById("slip-period").textContent        = periodLabel;
    document.getElementById("slip-issued-date").textContent   = issuedDate;
    document.getElementById("slip-rate").textContent          = formatIDR(p.ratePerShift || 75000);
    document.getElementById("slip-shifts").textContent        = `${p.totalShifts || 0} shift`;
    document.getElementById("slip-total").textContent         = formatIDR(p.totalSalary);

    const preview     = document.getElementById("bukti-tf-preview");
    const placeholder = document.getElementById("bukti-tf-placeholder");
    const hapusBtn    = document.getElementById("btn-hapus-bukti");
    const fileInput   = document.getElementById("bukti-tf-file-input");
    if (p.buktiTF) {
        preview.src = p.buktiTF; preview.classList.remove("hidden");
        placeholder.style.display = "none"; hapusBtn.classList.remove("hidden");
    } else {
        preview.src = ""; preview.classList.add("hidden");
        placeholder.style.display = "flex"; hapusBtn.classList.add("hidden");
    }
    if (fileInput) fileInput.value = "";
    _currentSlipData = { p, cashierEmail, periodLabel, issuedDate };
    openModal("slip-gaji-modal");
}

window.handleBuktiTFUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Ukuran file maksimal 5MB!", "warning"); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl     = e.target.result;
        const preview     = document.getElementById("bukti-tf-preview");
        const placeholder = document.getElementById("bukti-tf-placeholder");
        const hapusBtn    = document.getElementById("btn-hapus-bukti");
        
        if (!_currentSlipData) return;
        
        try {
            await apiFetch(`${API_BASE}/payroll/${_currentSlipData.p.id}/upload-bukti`, {
                method: 'POST',
                body: JSON.stringify({ buktiTF: dataUrl })
            });
            
            preview.src = dataUrl; preview.classList.remove("hidden");
            placeholder.style.display = "none"; hapusBtn.classList.remove("hidden");
            
            await loadPayroll();
            const updatedP = PAYROLL.find(x => x.id === _currentSlipData.p.id);
            if (updatedP) _currentSlipData.p = updatedP;
            
            showToast("Bukti transfer berhasil diupload!", "success");
        } catch(err) {
            showToast("Gagal mengupload bukti transfer: " + err.message, "danger");
        }
    };
    reader.readAsDataURL(file);
}

window.hapusBuktiTF = async function() {
    if (!_currentSlipData) return;
    const preview     = document.getElementById("bukti-tf-preview");
    const placeholder = document.getElementById("bukti-tf-placeholder");
    const hapusBtn    = document.getElementById("btn-hapus-bukti");
    const fileInput   = document.getElementById("bukti-tf-file-input");
    
    try {
        await apiFetch(`${API_BASE}/payroll/${_currentSlipData.p.id}/bukti`, { method: 'DELETE' });
        
        preview.src = ""; preview.classList.add("hidden");
        placeholder.style.display = "flex"; hapusBtn.classList.add("hidden");
        if (fileInput) fileInput.value = "";
        
        await loadPayroll();
        const updatedP = PAYROLL.find(x => x.id === _currentSlipData.p.id);
        if (updatedP) _currentSlipData.p = updatedP;
        
        showToast("Bukti transfer dihapus.", "success");
    } catch(err) {
        showToast("Gagal menghapus bukti transfer: " + err.message, "danger");
    }
}

window.sendSlipEmail = async function() {
    if (!_currentSlipData) return;
    const { p, cashierEmail } = _currentSlipData;
    if (cashierEmail === "(email tidak terdaftar)") { showToast("Email kasir tidak terdaftar!", "warning"); return; }
    
    const btn = document.getElementById("btn-send-slip-email");
    const originalText = btn ? btn.innerHTML : "Kirim Slip Email";
    if (btn) {
        btn.setAttribute("disabled", "true");
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
    }
    
    try {
        const result = await apiFetch(`${API_BASE}/payroll/${p.id}/send-email`, {
            method: "POST"
        });
        showToast(result.message || "Slip gaji berhasil dikirim ke email!", "success");
    } catch (err) {
        console.error(err);
        showToast("Gagal mengirim slip gaji: " + err.message, "danger");
    } finally {
        if (btn) {
            btn.removeAttribute("disabled");
            btn.innerHTML = originalText;
        }
    }
}

// ============================================================
// UTILITIES
// ============================================================
function formatIDR(amount) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", minimumFractionDigits: 0
    }).format(amount).replace("IDR", "Rp");
}

window.openModal  = function(id) { document.getElementById(id)?.classList.add("active"); }
window.closeModal = function(id) { document.getElementById(id)?.classList.remove("active"); }

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const icons = { success:"fa-circle-check", warning:"fa-triangle-exclamation", danger:"fa-circle-xmark", error:"fa-circle-xmark", info:"fa-circle-info" };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// Generic Excel Export Function (CSV with UTF-8 BOM for Excel compatibility)
function exportToExcel(filename, headers, rows) {
    let csvContent = "sep=,\n"; // tell Excel to use comma separator
    csvContent += headers.join(",") + "\n";
    rows.forEach(row => {
        const escapedRow = row.map(val => {
            let str = String(val === null || val === undefined ? "" : val);
            str = str.replace(/"/g, '""');
            if (str.includes(",") || str.includes("\n") || str.includes('"')) {
                str = `"${str}"`;
            }
            return str;
        });
        csvContent += escapedRow.join(",") + "\n";
    });
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Generic PDF Print Function
function printReportHTML(title, headers, rows) {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        showToast("Pop-up blocker aktif! Mohon izinkan pop-up untuk mencetak PDF.", "warning");
        return;
    }
    
    let tableHeaders = headers.map(h => `<th>${h}</th>`).join('');
    let tableRows = rows.map(row => {
        return `<tr>${row.map(val => `<td>${val}</td>`).join('')}</tr>`;
    }).join('');
    
    const issuedDate = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
    
    printWindow.document.write(`
        <html>
        <head>
            <title>${title}</title>
            <style>
                body {
                    font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
                    color: #333;
                    padding: 40px;
                    line-height: 1.5;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .header h1 {
                    margin: 0;
                    color: #4e3629;
                    font-size: 24px;
                    font-weight: 700;
                }
                .header p {
                    margin: 5px 0 0 0;
                    color: #666;
                    font-size: 14px;
                }
                .meta {
                    margin-bottom: 20px;
                    font-size: 13px;
                    color: #555;
                    display: flex;
                    justify-content: space-between;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                    font-size: 13px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 10px 12px;
                    text-align: left;
                }
                th {
                    background-color: #f8f6f2;
                    color: #4e3629;
                    font-weight: 600;
                }
                tr:nth-child(even) {
                    background-color: #faf9f6;
                }
                .footer {
                    margin-top: 50px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 13px;
                }
                .signature-box {
                    text-align: center;
                    width: 200px;
                }
                .signature-space {
                    height: 70px;
                }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>KOPI SIBEI CAFE</h1>
                <p>${title}</p>
            </div>
            <div class="meta">
                <span>Diterbitkan oleh: Store Manager</span>
                <span>Waktu Cetak: ${issuedDate}</span>
            </div>
            <table>
                <thead>
                    <tr>${tableHeaders}</tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="footer">
                <div>
                    <p>Dicetak otomatis oleh POS System.</p>
                </div>
                <div class="signature-box">
                    <p>Mengetahui,</p>
                    <div class="signature-space"></div>
                    <p><strong>Store Manager</strong></p>
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function exportAbsensiExcel() {
    const searchVal  = (document.getElementById("absensi-search")?.value || "").toLowerCase();
    const filterDate = document.getElementById("absensi-filter-date")?.value || "";
    const filtered   = ATTENDANCES.filter(att => {
        const mName = (att.nama_kasir || '').toLowerCase().includes(searchVal);
        const mDate = !filterDate || (att.date || '').slice(0,10) === filterDate;
        return mName && mDate;
    });

    const headers = ["Nama Kasir", "Tanggal", "Jam Masuk", "Jam Keluar", "Status Kehadiran"];
    const rows = filtered.map(att => [
        att.nama_kasir || '-',
        (att.date || '').slice(0, 10),
        att.jam_masuk ? String(att.jam_masuk).slice(0, 8) : '-',
        att.jam_keluar ? String(att.jam_keluar).slice(0, 8) : '-',
        att.status || '-'
    ]);

    exportToExcel("Laporan_Kehadiran_Kasir.csv", headers, rows);
    showToast("Laporan Kehadiran Kasir berhasil diexport ke Excel!", "success");
}

function exportAbsensiPdf() {
    const searchVal  = (document.getElementById("absensi-search")?.value || "").toLowerCase();
    const filterDate = document.getElementById("absensi-filter-date")?.value || "";
    const filtered   = ATTENDANCES.filter(att => {
        const mName = (att.nama_kasir || '').toLowerCase().includes(searchVal);
        const mDate = !filterDate || (att.date || '').slice(0,10) === filterDate;
        return mName && mDate;
    });

    const headers = ["Nama Kasir", "Tanggal", "Jam Masuk", "Jam Keluar", "Status Kehadiran"];
    const rows = filtered.map(att => [
        att.nama_kasir || '-',
        (att.date || '').slice(0, 10),
        att.jam_masuk ? String(att.jam_masuk).slice(0, 8) : '-',
        att.jam_keluar ? String(att.jam_keluar).slice(0, 8) : '-',
        att.status || '-'
    ]);

    printReportHTML("LAPORAN KEHADIRAN KASIR", headers, rows);
}

function exportPayrollExcel() {
    const searchVal   = (document.getElementById("payroll-search")?.value   || "").toLowerCase();
    const filterMonth = document.getElementById("payroll-filter-month")?.value || "";
    const filtered    = PAYROLL.filter(p =>
        (p.cashier || '').toLowerCase().includes(searchVal) &&
        (filterMonth === "" || p.period === filterMonth)
    );

    const headers = ["Nama Kasir", "Periode", "Bayaran per Shift", "Total Shift", "Total Gaji"];
    const rows = filtered.map(p => [
        p.cashier || '-',
        p.period || '-',
        formatIDR(p.ratePerShift || 75000),
        p.totalShifts || 0,
        formatIDR(p.totalSalary || 0)
    ]);

    exportToExcel("Laporan_Gaji_Kasir.csv", headers, rows);
    showToast("Laporan Penggajian Kasir berhasil diexport ke Excel!", "success");
}

function exportReportExcel() {
    const searchVal = (document.getElementById("report-search")?.value || "").toLowerCase();
    const dateStart = document.getElementById("report-date-start")?.value || "";
    const dateEnd   = document.getElementById("report-date-end")?.value   || "";
    const payMethod = document.getElementById("report-payment-method")?.value || "all";

    const filtered = TRANSACTIONS.filter(tx => {
        const txId    = `tx-${String(tx.id_transaksi).padStart(6,'0')}`;
        const cashier = (tx.nama_kasir || '').toLowerCase();
        const mSearch = txId.includes(searchVal) || cashier.includes(searchVal);
        const txDate  = (tx.tanggal_transaksi || '').slice(0, 10);
        const mStart  = !dateStart || txDate >= dateStart;
        const mEnd    = !dateEnd   || txDate <= dateEnd;
        const mMethod = payMethod === 'all' || tx.metode_pembayaran === payMethod;
        return mSearch && mStart && mEnd && mMethod;
    });

    const headers = ["ID Transaksi", "Tanggal & Waktu", "Kasir", "Subtotal", "Pajak & Servis", "Total Akhir", "Metode Pembayaran", "Status"];
    const rows = filtered.map(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = Math.round(total / 1.15);
        const taxSvc = total - sub;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        return [
            txId,
            dateStr,
            tx.nama_kasir || '-',
            formatIDR(sub),
            formatIDR(taxSvc),
            formatIDR(total),
            tx.metode_pembayaran || '-',
            "Selesai"
        ];
    });

    exportToExcel("Laporan_Penjualan_Cafe.csv", headers, rows);
    showToast("Laporan Penjualan berhasil diexport ke Excel!", "success");
}

function exportReportPdf() {
    const searchVal = (document.getElementById("report-search")?.value || "").toLowerCase();
    const dateStart = document.getElementById("report-date-start")?.value || "";
    const dateEnd   = document.getElementById("report-date-end")?.value   || "";
    const payMethod = document.getElementById("report-payment-method")?.value || "all";

    const filtered = TRANSACTIONS.filter(tx => {
        const txId    = `tx-${String(tx.id_transaksi).padStart(6,'0')}`;
        const cashier = (tx.nama_kasir || '').toLowerCase();
        const mSearch = txId.includes(searchVal) || cashier.includes(searchVal);
        const txDate  = (tx.tanggal_transaksi || '').slice(0, 10);
        const mStart  = !dateStart || txDate >= dateStart;
        const mEnd    = !dateEnd   || txDate <= dateEnd;
        const mMethod = payMethod === 'all' || tx.metode_pembayaran === payMethod;
        return mSearch && mStart && mEnd && mMethod;
    });

    const headers = ["ID Transaksi", "Tanggal & Waktu", "Kasir", "Subtotal", "Pajak & Servis", "Total Akhir", "Metode", "Status"];
    const rows = filtered.map(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = Math.round(total / 1.15);
        const taxSvc = total - sub;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        return [
            txId,
            dateStr,
            tx.nama_kasir || '-',
            formatIDR(sub),
            formatIDR(taxSvc),
            formatIDR(total),
            tx.metode_pembayaran || '-',
            "Selesai"
        ];
    });

    printReportHTML("LAPORAN DETIL TRANSAKSI PENJUALAN", headers, rows);
}

async function sendEmailReport() {
    const btn = document.getElementById("btn-email-report");
    if (!btn) return;
    
    const dateStart = document.getElementById("report-date-start")?.value || "";
    const dateEnd   = document.getElementById("report-date-end")?.value   || "";
    
    const originalText = btn.innerHTML;
    btn.setAttribute("disabled", "true");
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
    
    try {
        const result = await apiFetch(`${API_BASE}/report/email`, {
            method: "POST",
            body: JSON.stringify({
                start_date: dateStart,
                end_date: dateEnd
            })
        });
        
        if (result.status === "warning") {
            showToast(result.message, "warning");
        } else {
            showToast(result.message || "Laporan penjualan berhasil dikirim ke email!", "success");
        }
    } catch (e) {
        console.error(e);
        showToast(e.message || "Gagal mengirimkan laporan ke email.", "danger");
    } finally {
        btn.removeAttribute("disabled");
        btn.innerHTML = originalText;
    }
}

window.selectTemplateImage  = function() {};
window.updateMenuImagePreview = function() {};
