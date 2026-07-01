// ============================================================
// KOPI SIBEI — KASIR.JS  (disesuaikan struktur DB nyata)
//
// products : id_product, nama_product, kategori(enum), harga, icon, warna
// transaksi: id_transaksi, id_user, tanggal_transaksi, total_harga,
//            metode_pembayaran, uang_bayar, kembalian, status_transaksi
// detail   : id_detail, id_transaksi, id_products, qty, subtotal
// absensi  : id_absensi, date, nama_kasir, jam_masuk, jam_keluar,
//            total_jam, status, waktu_dibuat
// ============================================================

const API_BASE = '/api';

// ── Session ──────────────────────────────────────────────────
let SESSION = { id: null, nama: 'Kasir', role: 'kasir' };

// ── State Global ─────────────────────────────────────────────
let MENU_ITEMS     = [];
let transactions   = [];
let historyTransactions = [];
let attendanceLogs = [];
let cart           = [];
let activeCategory = 'all';
let searchQuery    = '';
let salesChart     = null;
let currentAttendance = {
    status: 'Belum Absen',   // Belum Absen | Aktif Bekerja | Selesai Shift
    clockIn: '', clockOut: '', activeDate: '', id_absensi: null
};

// Label cantik untuk kategori enum
const KATEGORI_LABEL = {
    'coffee'    : '☕ Coffee',
    'non-coffee': '🥤 Non Coffee',
    'snack'     : '🍿 Snack',
    'dessert'   : '🍰 Dessert'
};

// ── Header request — WAJIB sertakan X-User-Name ──────────────
function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-User-Role' : SESSION.role,
        'X-User-Id'   : SESSION.id,
        'X-User-Name' : SESSION.nama   // dipakai absensi (nama_kasir)
    };
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    initRealtimeClock();
    initNavigationRouter();
    initMobileSidebar();
    initCartInteractions();
    initPaymentInteractions();
    initAttendanceInteractions();
    initHistoryFilters();
    initGeneralModalTriggers();
    disableBrowserZooming();
    initChart();

    // Load semua data dari database
    loadKategoriDanProduk();
    loadTransaksiHariIni();
    loadAbsensiHariIni();
    loadRiwayatAbsensi();
});

// ============================================================
//  SESSION — baca dari localStorage setelah login
// ============================================================
function loadSession() {
    try {
        const raw = localStorage.getItem('activeUser');
        if (raw) {
            const u = JSON.parse(raw);
            SESSION.id   = u.id   || u.id_user || null;
            SESSION.nama = u.nama || 'Kasir';
            SESSION.role = localStorage.getItem('activeRole') || u.role || 'kasir';
        }
    } catch (e) { console.warn('Session error:', e); }

    const nameEl = document.getElementById('active-cashier-name');
    if (nameEl) nameEl.innerText = SESSION.nama;
    const welcomeEl = document.getElementById('welcome-msg');
    if (welcomeEl)
        welcomeEl.innerText = `Selamat Datang Kembali, ${SESSION.nama.split(' ')[0]}! 👋`;
}

// ============================================================
//  KATEGORI → tabs dinamis → PRODUK
// ============================================================
async function loadKategoriDanProduk() {
    try {
        const res  = await fetch(`${API_BASE}/kategori`);
        const data = await res.json();
        if (data.status === 'success') {
            // Update KATEGORI_LABEL secara dinamis agar menampilkan nama kategori yang cantik
            (data.data || []).forEach(k => {
                KATEGORI_LABEL[k.id_kategori] = k.nama_kategori;
            });
            renderCategoryTabs(data.data);
        }
    } catch (e) {
        console.error('Gagal load kategori:', e);
    }
    loadProducts();
}

function renderCategoryTabs(list) {
    const container = document.querySelector('.category-tabs');
    if (!container) return;
    container.innerHTML = `<button class="category-btn active" data-category="all">Semua</button>`;
    list.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.setAttribute('data-category', String(k.id_kategori));
        btn.innerText = k.nama_kategori;
        container.appendChild(btn);
    });
    initPOSFilters();
}

// ============================================================
//  PRODUK — GET /api/products
//  Kolom: id_product, nama_product, kategori, harga, icon, warna
// ============================================================
async function loadProducts() {
    const grid = document.getElementById('menu-grid-container');
    if (grid) grid.innerHTML =
        `<div class="empty-cart-box span-2">
            <i class="fa-solid fa-spinner fa-spin"></i><h4>Memuat menu...</h4>
         </div>`;
    try {
        const res  = await fetch(`${API_BASE}/products`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message);

        // ── Mapping kolom DB → format internal ──
        MENU_ITEMS = data.data.map(p => ({
            id           : p.id_product,
            name         : p.nama_product,
            price        : Number(p.harga),
            category     : p.kategori,                          // string enum: coffee, non-coffee, snack, dessert
            nama_kategori: KATEGORI_LABEL[p.kategori] || p.kategori,
            foto         : p.foto,
            warna        : p.warna || '#4e3629'
        }));

        renderPOSMenu(MENU_ITEMS);
    } catch (e) {
        console.error('Gagal load produk:', e);
        showToast('Gagal memuat menu. Pastikan Flask berjalan!', 'danger');
        if (grid) grid.innerHTML =
            `<div class="empty-cart-box span-2">
                <i class="fa-solid fa-plug-circle-xmark"></i>
                <h4>Koneksi Gagal</h4>
                <p>Server Flask (port 5000) tidak dapat dihubungi.</p>
             </div>`;
    }
}

// ============================================================
//  RENDER MENU GRID
// ============================================================
function renderPOSMenu(items) {
    const grid = document.getElementById('menu-grid-container');
    if (!grid) return;
    grid.innerHTML = '';

    if (!items.length) {
        grid.innerHTML =
            `<div class="empty-cart-box span-2">
                <i class="fa-solid fa-mug-saucer"></i>
                <h4>Menu Tidak Ditemukan</h4>
                <p>Coba kata kunci pencarian yang lain.</p>
             </div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card';

        // Render photo if exists, otherwise fallback to category default icon
        const photoHtml = item.foto 
            ? `<img src="${item.foto}" style="width: 100%; height: 100%; object-fit: cover;" alt="${item.name}">` 
            : `<i class="fa-solid fa-mug-hot" style="font-size:2.4rem; color:${item.warna}"></i>`;

        card.innerHTML = `
            <div class="menu-card-img-wrapper" style="background:${item.warna}1a; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                ${photoHtml}
            </div>
            <div class="menu-card-category">${item.nama_kategori}</div>
            <h4 class="menu-card-name">${item.name}</h4>
            <div class="menu-card-footer">
                <span class="menu-card-price">${formatIDR(item.price)}</span>
                <button class="btn-add-to-cart" onclick="addItemToCart(${item.id})">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>`;
        grid.appendChild(card);
    });
}

// ============================================================
//  FILTER MENU
// ============================================================
function initPOSFilters() {
    const tabContainer = document.querySelector('.category-tabs');
    if (tabContainer) {
        const newTabs = tabContainer.cloneNode(true);
        tabContainer.parentNode.replaceChild(newTabs, tabContainer);
        newTabs.addEventListener('click', e => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            newTabs.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.getAttribute('data-category');
            applyMenuFilter();
        });
    }
    const searchInput = document.getElementById('menu-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            searchQuery = e.target.value;
            applyMenuFilter();
        });
    }
}

function applyMenuFilter() {
    const filtered = MENU_ITEMS.filter(item => {
        const matchCat    = activeCategory === 'all' || item.category === activeCategory;
        const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
    });
    renderPOSMenu(filtered);
}

// ============================================================
//  CART
// ============================================================
function initCartInteractions() {
    document.getElementById('btn-reset-cart')?.addEventListener('click', () => {
        if (cart.length > 0) { resetCartState(); showToast('Keranjang dikosongkan', 'success'); }
    });
}

window.addItemToCart = function (itemId) {
    const menu = MENU_ITEMS.find(i => i.id === itemId);
    if (!menu) return;
    const existing = cart.find(i => i.id === itemId);
    if (existing) existing.qty += 1;
    else cart.push({ id: menu.id, name: menu.name, price: menu.price, qty: 1 });
    renderCartList();
    showToast(`${menu.name} ditambahkan!`, 'success');
};

function renderCartList() {
    const container   = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-pay-checkout');
    if (!container) return;
    container.innerHTML = '';

    if (!cart.length) {
        container.innerHTML =
            `<div class="empty-cart-box">
                <i class="fa-solid fa-mug-saucer"></i>
                <h4>Keranjang Kosong</h4>
                <p>Klik tombol "+" pada menu untuk memesan.</p>
             </div>`;
        checkoutBtn?.classList.add('disabled');
        checkoutBtn?.setAttribute('disabled','true');
        checkoutBtn?.classList.remove('btn-highlight');
        updateCartTotals(0, 0, 0, 0);
        return;
    }

    cart.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-details">
                <h4 class="cart-item-name">${item.name}</h4>
                <p class="cart-item-price">${formatIDR(item.price)}</p>
            </div>
            <div class="cart-item-qty-control">
                <button class="btn-qty" onclick="adjustCartQty(${item.id},-1)">
                    <i class="fa-solid fa-minus"></i></button>
                <div class="qty-val">${item.qty}</div>
                <button class="btn-qty" onclick="adjustCartQty(${item.id},1)">
                    <i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="cart-item-subtotal">${formatIDR(item.price * item.qty)}</div>
            <button class="btn-delete-item" onclick="deleteCartItem(${item.id})">
                <i class="fa-regular fa-trash-can"></i></button>`;
        container.appendChild(row);
    });

    checkoutBtn?.classList.remove('disabled');
    checkoutBtn?.removeAttribute('disabled');
    checkoutBtn?.classList.add('btn-highlight');
    calculateCartState();
}

window.adjustCartQty = function (itemId, change) {
    const target = cart.find(i => i.id === itemId);
    if (!target) return;
    target.qty += change;
    if (target.qty < 1) deleteCartItem(itemId);
    else renderCartList();
};

window.deleteCartItem = function (itemId) {
    const idx = cart.findIndex(i => i.id === itemId);
    if (idx > -1) {
        const name = cart[idx].name;
        cart.splice(idx, 1);
        renderCartList();
        showToast(`${name} dihapus`, 'warning');
    }
};

function resetCartState() { cart = []; renderCartList(); }

function calculateCartState() {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;
    updateCartTotals(sub, tax, svc, sub);
}

function updateCartTotals(sub, tax, svc, total) {
    document.getElementById('cart-subtotal').innerText    = formatIDR(sub);
    document.getElementById('cart-tax').innerText         = formatIDR(tax);
    document.getElementById('cart-service').innerText     = formatIDR(svc);
    document.getElementById('cart-grand-total').innerText = formatIDR(total);
}

// ============================================================
//  PAYMENT
// ============================================================
function initPaymentInteractions() {
    const checkoutBtn = document.getElementById('btn-pay-checkout');
    const cashInput   = document.getElementById('cash-tendered');
    const methodCards = document.querySelectorAll('.method-card');

    checkoutBtn?.addEventListener('click', () => {
        if (!cart.length) return;
        const sub   = cart.reduce((s, i) => s + i.price * i.qty, 0);
        const tax   = 0;
        const svc   = 0;
        const total = sub;

        document.getElementById('payment-grand-total').innerText = formatIDR(total);
        document.getElementById('payment-grand-total').setAttribute('data-amount', total);
        cashInput.value = '';
        document.getElementById('payment-change').innerText = 'Rp0';
        document.getElementById('insufficient-funds-alert').classList.add('hidden');
        document.querySelector('input[name="payment_method"][value="Cash"]').checked = true;
        methodCards.forEach(c => c.classList.remove('active'));
        document.querySelector('.method-card[data-method="Cash"]').classList.add('active');
        document.getElementById('cash-calculator-section').classList.remove('hidden');
        document.getElementById('change-display-box').classList.remove('hidden');
        openModal('payment-modal');
        setTimeout(() => cashInput.focus(), 200);
    });

    document.querySelectorAll('.btn-quick-cash').forEach(btn => {
        btn.addEventListener('click', () => {
            const total = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
            cashInput.value = btn.getAttribute('data-amount') === 'exact'
                ? total : parseInt(btn.getAttribute('data-amount'));
            calculateChange(total);
        });
    });

    cashInput?.addEventListener('input', () =>
        calculateChange(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'))));

    methodCards.forEach(card => {
        card.addEventListener('click', () => {
            methodCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type="radio"]').checked = true;
            const isNonCash = card.querySelector('input').value !== 'Cash';
            document.getElementById('cash-calculator-section').classList.toggle('hidden', isNonCash);
            document.getElementById('change-display-box').classList.toggle('hidden', isNonCash);
            document.getElementById('insufficient-funds-alert').classList.add('hidden');
            if (!isNonCash)
                calculateChange(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount')));
        });
    });

    document.getElementById('btn-process-payment')?.addEventListener('click', processActiveCheckout);
}

function calculateChange(grandTotal) {
    const cash = parseInt(document.getElementById('cash-tendered').value) || 0;
    const chg  = cash - grandTotal;
    document.getElementById('payment-change').innerText = chg >= 0 ? formatIDR(chg) : 'Rp0';
    document.getElementById('insufficient-funds-alert')
        .classList.toggle('hidden', cash === 0 || chg >= 0);
}

// ── Proses Checkout → POST /api/transaksi ────────────────────
async function processActiveCheckout() {
    const grandTotal = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
    const method     = document.querySelector('input[name="payment_method"]:checked').value;
    const cashInput  = document.getElementById('cash-tendered');
    let cashPaid = grandTotal, change = 0;

    if (method === 'Cash') {
        cashPaid = parseInt(cashInput.value) || 0;
        if (cashPaid < grandTotal) {
            showToast('Uang tunai tidak cukup!', 'danger');
            document.getElementById('insufficient-funds-alert').classList.remove('hidden');
            document.querySelector('.payment-modal-content').classList.add('modal-shake');
            setTimeout(() =>
                document.querySelector('.payment-modal-content').classList.remove('modal-shake'), 500);
            return;
        }
        change = cashPaid - grandTotal;
    }

    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;

    // ── Payload sesuai kolom transaksi & detail_transaksi ──
    // transaksi  : uang_bayar, kembalian, metode_pembayaran
    // detail     : id_product (→ id_products di DB), qty, subtotal
    const payload = {
        id_user           : SESSION.id,
        total_harga       : grandTotal,
        uang_bayar        : cashPaid,        // kolom: uang_bayar
        kembalian         : change,          // kolom: kembalian
        metode_pembayaran : method,          // enum: Cash|QRIS|Debit
        items: cart.map(i => ({
            id_product: i.id,               // app.py pakai ini untuk id_products
            qty       : i.qty,              // kolom: qty (bukan jumlah)
            subtotal  : i.price * i.qty     // tidak ada harga_satuan di detail_transaksi
        }))
    };

    const btnProcess = document.getElementById('btn-process-payment');
    btnProcess.setAttribute('disabled','true');
    btnProcess.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    try {
        const res  = await fetch(`${API_BASE}/transaksi`, {
            method:'POST', headers: apiHeaders(), body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            const txForReceipt = {
                id: data.id_transaksi,
                txId: `TX-${String(data.id_transaksi).padStart(6,'0')}`,
                date: getFormattedDateTime(new Date()),
                cashier: SESSION.nama,
                items: [...cart],
                subtotal: sub, tax: 0, service: 0,
                grandTotal, method, cashPaid, change
            };
            closeModal('payment-modal');
            resetCartState();
            showToast('Transaksi Berhasil Diproses!', 'success');
            await loadTransaksiHariIni();
            setTimeout(() => simulateReceiptPrint(txForReceipt), 400);
        } else {
            showToast(data.message || 'Gagal menyimpan transaksi!', 'danger');
        }
    } catch (e) {
        console.error(e);
        showToast('Gagal terhubung ke server!', 'danger');
    } finally {
        btnProcess.removeAttribute('disabled');
        btnProcess.innerHTML = '<i class="fa-solid fa-square-check"></i> Proses Pembayaran';
    }
}

// ============================================================
//  STRUK / RECEIPT
// ============================================================
function simulateReceiptPrint(tx, isReprint = false) {
    document.getElementById('print-loading-overlay')?.classList.add('hidden');
    openModal('receipt-modal');
    
    // Toggle close buttons based on isReprint
    const closeBtnX = document.getElementById('btn-close-receipt-x');
    const closeBtnFooter = document.getElementById('btn-close-receipt-footer');
    if (isReprint) {
        closeBtnX?.classList.remove('hidden');
        closeBtnFooter?.classList.remove('hidden');
    } else {
        closeBtnX?.classList.add('hidden');
        closeBtnFooter?.classList.add('hidden');
    }

    document.getElementById('receipt-tx-id').innerText       = tx.txId || `#${tx.id}`;
    document.getElementById('receipt-date').innerText        = tx.date;
    document.getElementById('receipt-cashier').innerText     = tx.cashier;
    document.getElementById('receipt-subtotal').innerText    = formatIDR(tx.subtotal);
    document.getElementById('receipt-tax').innerText         = formatIDR(tx.tax);
    document.getElementById('receipt-service').innerText     = formatIDR(tx.service);
    document.getElementById('receipt-grand-total').innerText = formatIDR(tx.grandTotal);
    document.getElementById('receipt-method').innerText      = tx.method;
    document.getElementById('receipt-cash-paid').innerText   = formatIDR(tx.cashPaid);
    document.getElementById('receipt-change').innerText      = formatIDR(tx.change);

    const tbody = document.getElementById('receipt-items-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        tx.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td align="left">${item.name}
                    <br><small style="color:#666">@${formatIDR(item.price)}</small></td>
                <td align="center">${item.qty}</td>
                <td align="right">${formatIDR(item.price * item.qty)}</td>`;
            tbody.appendChild(tr);
        });
    }

    const printBtn = document.getElementById('btn-print-receipt');
    if (printBtn) {
        const newBtn = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(newBtn, printBtn);
        newBtn.addEventListener('click', () => {
            window.print();
            if (!isReprint) {
                closeModal('receipt-modal');
            }
        });
    }
}

// ============================================================
//  TRANSAKSI — GET dari database
//  Kolom response: tanggal_transaksi, uang_bayar, kembalian,
//                  metode_pembayaran, total_harga, nama_kasir
// ============================================================
async function loadTransaksiHariIni() {
    const dObj = new Date();
    const year = dObj.getFullYear();
    const month = String(dObj.getMonth() + 1).padStart(2, '0');
    const date = String(dObj.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${date}`;
    try {
        const res  = await fetch(`${API_BASE}/transaksi?tanggal=${today}`, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status === 'success') {
            transactions = data.data.map(tx => ({
                id        : tx.id_transaksi,
                txId      : `TX-${String(tx.id_transaksi).padStart(6,'0')}`,
                date      : tx.tanggal_transaksi || '',         // ← kolom yang benar
                cashier   : tx.nama_kasir || SESSION.nama,
                grandTotal: Number(tx.total_harga),
                method    : tx.metode_pembayaran || 'Cash',
                cashPaid  : Number(tx.uang_bayar  || tx.total_harga),  // ← uang_bayar
                change    : Number(tx.kembalian   || 0),
                status    : tx.status_transaksi || 'berhasil',
                items     : []
            }));
            updateDashboardMetrics();
            renderRecentTransactionsTable();
            updateChart();
        }
    } catch (e) { console.error('Gagal load transaksi:', e); }
}

// ============================================================
//  RIWAYAT TRANSAKSI (Filter & Load)
// ============================================================
async function loadRiwayatTransaksi(selectedDate = '') {
    try {
        let url = `${API_BASE}/transaksi`;
        if (selectedDate) {
            url += `?tanggal=${selectedDate}`;
        }
        const res  = await fetch(url, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status === 'success') {
            historyTransactions = data.data.map(tx => ({
                id        : tx.id_transaksi,
                txId      : `TX-${String(tx.id_transaksi).padStart(6,'0')}`,
                date      : tx.tanggal_transaksi || '',
                cashier   : tx.nama_kasir || SESSION.nama,
                grandTotal: Number(tx.total_harga),
                method    : tx.metode_pembayaran || 'Cash',
                cashPaid  : Number(tx.uang_bayar  || tx.total_harga),
                change    : Number(tx.kembalian   || 0),
                status    : tx.status_transaksi || 'berhasil',
                items     : []
            }));
            applyHistoryFilters();
        }
    } catch (e) { console.error('Gagal load riwayat transaksi:', e); }
}

function renderTransactionsHistoryTable(txArray) {
    const tbody = document.getElementById('history-transactions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!txArray.length) {
        tbody.innerHTML =
            `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">
                <i class="fa-solid fa-box-open" style="font-size:24px;display:block;margin-bottom:10px"></i>
                Tidak ada riwayat transaksi.
             </td></tr>`;
        return;
    }

    txArray.forEach(tx => {
        const iconMap   = { Cash:'fa-money-bill-wave', QRIS:'fa-qrcode', Debit:'fa-credit-card' };
        const badgeClass = tx.method === 'Cash' ? 'badge-success' : 'badge-warning';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${tx.txId}</strong></td>
            <td>${formatTanggal(tx.date)}</td>
            <td>${tx.cashier}</td>
            <td><strong>${formatIDR(tx.grandTotal)}</strong></td>
            <td><span class="badge ${badgeClass}">
                <i class="fa-solid ${iconMap[tx.method]||'fa-wallet'}"></i> ${tx.method}</span></td>
            <td><span class="badge badge-success">
                <i class="fa-solid fa-circle-check"></i> Selesai</span></td>
            <td style="text-align:center">
                <div class="action-cell-buttons">
                    <button class="btn-table-action btn-detail"
                        onclick="openTransactionDetails(${tx.id})">
                        <i class="fa-regular fa-eye"></i> Detail
                    </button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function initHistoryFilters() {
    const txSearch  = document.getElementById('tx-search');
    const txDate    = document.getElementById('tx-filter-date');
    const txPayment = document.getElementById('tx-filter-payment');
    const btnReset  = document.getElementById('btn-reset-tx-filters');

    async function onDateChange() {
        await loadRiwayatTransaksi(txDate.value);
    }

    function apply() {
        const q = (txSearch.value||'').toLowerCase();
        const p = txPayment.value;
        const filtered = historyTransactions.filter(tx => {
            const mQ = tx.txId.toLowerCase().includes(q) || tx.cashier.toLowerCase().includes(q);
            const mP = p === 'all' || tx.method === p;
            return mQ && mP;
        });
        renderTransactionsHistoryTable(filtered);
    }

    window.applyHistoryFilters = apply;

    txSearch?.addEventListener('input', apply);
    txDate?.addEventListener('change', onDateChange);
    txPayment?.addEventListener('change', apply);
    btnReset?.addEventListener('click', async () => {
        txSearch.value=''; txDate.value=''; txPayment.value='all';
        await loadRiwayatTransaksi('');
        showToast('Filter direset','success');
    });
}

// ── Detail transaksi — load item dari DB ─────────────────────
// detail_transaksi: qty (bukan jumlah), harga_satuan (dari alias p.harga)
window.openTransactionDetails = async function (txId) {
    try {
        const res  = await fetch(`${API_BASE}/transaksi/${txId}`, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status !== 'success') { showToast('Gagal load detail','danger'); return; }

        const tx    = data.data;
        const items = tx.items || [];
        // Hitung ulang dari item (detail tidak simpan tax/service)
        const sub   = items.reduce((s, i) => s + Number(i.subtotal), 0);
        const tax   = 0;
        const svc   = 0;

        document.getElementById('detail-tx-id').innerText        = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        document.getElementById('detail-tx-date').innerText      = formatTanggal(tx.tanggal_transaksi);
        document.getElementById('detail-tx-method').innerText    = tx.metode_pembayaran;
        document.getElementById('detail-tx-cashier').innerText   = tx.nama_kasir || SESSION.nama;
        document.getElementById('detail-tx-subtotal').innerText  = formatIDR(sub);
        document.getElementById('detail-tx-tax').innerText       = formatIDR(tax);
        document.getElementById('detail-tx-service').innerText   = formatIDR(svc);
        document.getElementById('detail-tx-grand-total').innerText = formatIDR(Number(tx.total_harga));

        const tbody = document.getElementById('detail-tx-items-tbody');
        tbody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.nama_product}</strong></td>
                <td style="text-align:center">${item.qty}</td>
                <td style="text-align:right">${formatIDR(Number(item.harga_satuan))}</td>
                <td style="text-align:right"><strong>${formatIDR(Number(item.subtotal))}</strong></td>`;
            tbody.appendChild(tr);
        });

        openModal('tx-detail-modal');

        const reprintBtn = document.getElementById('btn-reprint-from-detail');
        const newBtn = reprintBtn.cloneNode(true);
        reprintBtn.parentNode.replaceChild(newBtn, reprintBtn);
        newBtn.addEventListener('click', () => {
            closeModal('tx-detail-modal');
            setTimeout(() => simulateReceiptPrint({
                id: tx.id_transaksi,
                txId: `TX-${String(tx.id_transaksi).padStart(6,'0')}`,
                date: tx.tanggal_transaksi,
                cashier: tx.nama_kasir || SESSION.nama,
                items: items.map(i => ({
                    name : i.nama_product,
                    price: Number(i.harga_satuan),
                    qty  : i.qty
                })),
                subtotal: sub, tax: 0, service: 0,
                grandTotal: Number(tx.total_harga),
                method: tx.metode_pembayaran,
                cashPaid: Number(tx.uang_bayar || tx.total_harga),
                change: Number(tx.kembalian || 0)
            }, true), 300);
        });
    } catch (e) {
        console.error(e);
        showToast('Gagal load detail transaksi','danger');
    }
};

// ============================================================
//  ABSENSI — TERHUBUNG KE DATABASE
//  Kolom: id_absensi, date, nama_kasir, jam_masuk,
//         jam_keluar, total_jam, status, waktu_dibuat
//  Tidak ada id_user! Identifikasi lewat nama_kasir
// ============================================================
async function loadAbsensiHariIni() {
    if (!SESSION.nama) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const res  = await fetch(`${API_BASE}/absensi?tanggal=${today}`, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status === 'success' && data.data.length > 0) {
            const abs = data.data[0];
            currentAttendance.id_absensi = abs.id_absensi;
            currentAttendance.clockIn    = (abs.jam_masuk  || '').slice(0, 8);
            currentAttendance.clockOut   = (abs.jam_keluar || '').slice(0, 8);
            currentAttendance.activeDate = today;
            currentAttendance.status     = abs.jam_keluar ? 'Selesai Shift' : 'Aktif Bekerja';
            updateAbsensiUI();
        }
    } catch (e) { console.error('Gagal load absensi hari ini:', e); }
}

async function loadRiwayatAbsensi() {
    if (!SESSION.nama) return;
    try {
        const res  = await fetch(`${API_BASE}/absensi`, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status === 'success') { attendanceLogs = data.data; renderAttendanceLog(); }
    } catch (e) { console.error('Gagal load riwayat absensi:', e); }
}

let webcamStream = null;

async function startWebcam() {
    const video = document.getElementById('webcam-video');
    const loading = document.getElementById('camera-loading-placeholder');
    const errorEl = document.getElementById('camera-error-placeholder');
    
    if (!video) return;
    
    if (loading) loading.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';
    
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false
        });
        video.srcObject = webcamStream;
        if (loading) loading.style.display = 'none';
    } catch (err) {
        console.error('Error accessing webcam:', err);
        if (loading) loading.style.display = 'none';
        if (errorEl) errorEl.style.display = 'flex';
    }
}

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    const video = document.getElementById('webcam-video');
    if (video) video.srcObject = null;
}

function captureWebcamPhoto() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    if (!video || !canvas || !webcamStream) return null;
    
    const context = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    
    // Draw unmirrored frame to canvas
    context.drawImage(video, 0, 0, 640, 480);
    
    // Draw simple timestamp overlay on photo
    context.font = "bold 18px Arial, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";
    context.lineWidth = 4;
    
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const text1 = `KOPI SIBEI - ${timestamp}`;
    
    context.strokeText(text1, 20, 450);
    context.fillText(text1, 20, 450);
    
    return canvas.toDataURL('image/jpeg', 0.85); // Reverted compression quality back to 85%
}

window.closeCameraModal = function() {
    stopWebcam();
    closeModal('camera-modal');
};

function initAttendanceInteractions() {
    // ── ABSEN MASUK ──
    document.getElementById('btn-clock-in')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Belum Absen') return;
        if (!SESSION.nama) { showToast('Session tidak ditemukan, login ulang','danger'); return; }

        // Buka modal kamera
        openModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Foto Absen Masuk';
        }
        
        // Mulai streaming
        await startWebcam();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            // Clone tombol jepret untuk membersihkan event listener sebelumnya
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = captureWebcamPhoto();
                if (!photo) {
                    showToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/masuk`, {
                        method : 'POST',
                        headers: apiHeaders(),
                        body   : JSON.stringify({ nama_kasir: SESSION.nama, foto: photo })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.status     = 'Aktif Bekerja';
                        currentAttendance.clockIn    = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.activeDate = new Date().toISOString().slice(0, 10);
                        currentAttendance.id_absensi = data.id_absensi;
                        updateAbsensiUI();
                        showToast('Absen Masuk berhasil dicatat!','success');
                        loadRiwayatAbsensi();
                        closeCameraModal();
                    } else {
                        showToast(data.message || 'Gagal absen masuk','danger');
                    }
                } catch (e) { 
                    showToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });

    // ── ABSEN KELUAR ──
    document.getElementById('btn-clock-out')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Aktif Bekerja') return;
        if (!hasWorkedEightHours()) {
            showToast('Anda belum mencapai 8 jam kerja!', 'warning');
            return;
        }

        // Buka modal kamera
        openModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Foto Absen Pulang';
        }
        
        // Mulai streaming
        await startWebcam();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            // Clone tombol jepret untuk membersihkan event listener sebelumnya
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = captureWebcamPhoto();
                if (!photo) {
                    showToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/keluar`, {
                        method : 'PUT',
                        headers: apiHeaders(),
                        body   : JSON.stringify({ foto: photo })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.clockOut = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.status   = 'Selesai Shift';
                        updateAbsensiUI();
                        showToast('Absen Pulang dicatat. Selamat beristirahat!','success');
                        loadRiwayatAbsensi();
                        closeCameraModal();
                    } else {
                        showToast(data.message || 'Gagal absen keluar','danger');
                    }
                } catch (e) { 
                    showToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });
}

function hasWorkedEightHours() {
    if (!currentAttendance.clockIn) return false;
    const timeParts = currentAttendance.clockIn.replace(/\./g, ':').split(':');
    if (timeParts.length < 2) return false;
    const clockInDate = new Date();
    clockInDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), timeParts[2] ? parseInt(timeParts[2]) : 0, 0);
    let diffHours = (new Date() - clockInDate) / (1000 * 60 * 60);
    if (diffHours < 0) {
        clockInDate.setDate(clockInDate.getDate() - 1);
        diffHours = (new Date() - clockInDate) / (1000 * 60 * 60);
    }
    return diffHours >= 8;
}

function updateAbsensiUI() {
    const btnIn  = document.getElementById('btn-clock-in');
    const btnOut = document.getElementById('btn-clock-out');
    const badge  = document.getElementById('nav-attendance-badge');

    if (currentAttendance.status === 'Aktif Bekerja') {
        btnIn?.setAttribute('disabled','true'); btnIn?.classList.add('disabled');
        btnOut?.removeAttribute('disabled');    btnOut?.classList.remove('disabled');
        if (badge) {
            badge.querySelector('.status-indicator').className = 'status-indicator success';
            badge.querySelector('.status-label').innerText = `Shift Aktif (${currentAttendance.clockIn})`;
        }
        const inEl = document.getElementById('att-summary-in');
        if (inEl) { inEl.innerText = currentAttendance.clockIn; inEl.classList.remove('empty-state-text'); }
        document.getElementById('att-summary-status').innerHTML =
            `<span class="badge badge-success">Aktif Bekerja</span>`;

    } else if (currentAttendance.status === 'Selesai Shift') {
        btnIn?.setAttribute('disabled','true');  btnIn?.classList.add('disabled');
        btnOut?.setAttribute('disabled','true'); btnOut?.classList.add('disabled');
        if (badge) {
            badge.querySelector('.status-indicator').className = 'status-indicator warning';
            badge.querySelector('.status-label').innerText = 'Sesi Shift Selesai';
        }
        const inEl  = document.getElementById('att-summary-in');
        const outEl = document.getElementById('att-summary-out');
        if (inEl)  { inEl.innerText  = currentAttendance.clockIn;  inEl.classList.remove('empty-state-text'); }
        if (outEl) { outEl.innerText = currentAttendance.clockOut; outEl.classList.remove('empty-state-text'); }
        document.getElementById('att-summary-status').innerHTML =
            `<span class="badge badge-success">Pulang</span>`;
    }
}

function renderAttendanceLog() {
    const tbody = document.getElementById('attendance-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!attendanceLogs.length) {
        tbody.innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">
                Belum ada data absensi bulan ini.
             </td></tr>`;
        return;
    }

    attendanceLogs.forEach(log => {
        // Kolom: date(date), jam_masuk(time), jam_keluar(time), total_jam(decimal), status
        const masuk  = (log.jam_masuk  || '').slice(0, 8) || '--:--';
        const keluar = (log.jam_keluar || '').slice(0, 8) || '--:--';
        const jam    = log.total_jam != null ? `${parseFloat(log.total_jam).toFixed(1)} Jam` : '--';
        const status = log.status || 'Hadir';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${formatTanggal(log.date, true)}</strong></td>
            <td><i class="fa-regular fa-clock text-green"></i> ${masuk}</td>
            <td><i class="fa-regular fa-clock text-gold"></i> ${keluar}</td>
            <td><strong>${jam}</strong></td>
            <td><span class="badge ${status==='Hadir'?'badge-success':'badge-warning'}">
                <i class="fa-solid fa-circle-check"></i> ${status}</span></td>`;
        tbody.appendChild(tr);
    });
}

// ============================================================
//  DASHBOARD METRICS
// ============================================================
function updateDashboardMetrics() {
    document.getElementById('stat-total-tx').innerText =
        transactions.length;
    document.getElementById('stat-revenue').innerText =
        formatIDR(transactions.reduce((s, t) => s + t.grandTotal, 0));
    document.getElementById('stat-items-sold').innerText =
        `${transactions.length} Transaksi`;
    // Menu terlaris dimuat secara async dari semua transaksi
    loadTopMenuAllTime();
}

// Fetch semua transaksi + detail untuk hitung menu terlaris all-time
async function loadTopMenuAllTime() {
    const el = document.getElementById('stat-top-menu');
    if (!el) return;
    el.innerText = '...';
    try {
        // 1. Ambil semua transaksi (tanpa filter tanggal)
        const res  = await fetch(`${API_BASE}/transaksi?all_cashiers=true`, { headers: apiHeaders() });
        const data = await res.json();
        if (data.status !== 'success' || !data.data.length) {
            el.innerText = '-'; return;
        }
        const allTx = data.data;

        // 2. Fetch detail setiap transaksi secara paralel
        const detailResults = await Promise.all(
            allTx.map(tx =>
                fetch(`${API_BASE}/transaksi/${tx.id_transaksi}`, { headers: apiHeaders() })
                    .then(r => r.json()).catch(() => null)
            )
        );

        // 3. Akumulasi qty per nama produk
        // Response: data.data.items → { nama_product, qty, harga_satuan, subtotal }
        const qtyMap = {};
        detailResults.forEach(resp => {
            if (!resp || resp.status !== 'success') return;
            const items = resp.data?.items || [];
            items.forEach(item => {
                const nama = item.nama_product || 'Unknown';
                qtyMap[nama] = (qtyMap[nama] || 0) + Number(item.qty || 1);
            });
        });

        // 4. Ambil yang qty-nya terbesar
        const entries = Object.entries(qtyMap);
        if (!entries.length) { el.innerText = '-'; return; }
        entries.sort((a, b) => b[1] - a[1]);
        const [topName, topQty] = entries[0];
        el.innerText = topName;

        // Perbarui juga sub-label jika ada
        const metaEl = el.closest('.stat-info')?.querySelector('.stat-meta');
        if (metaEl) metaEl.textContent = `Terjual ${topQty}× (All Time)`;

    } catch (e) {
        console.error('Gagal load top menu:', e);
        el.innerText = '-';
    }
}

function renderRecentTransactionsTable() {
    const tbody = document.getElementById('recent-transactions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const top5 = transactions.slice(0, 5);
    if (!top5.length) {
        tbody.innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">
                Tidak ada transaksi hari ini.</td></tr>`;
        return;
    }
    top5.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${tx.txId}</strong></td>
            <td>${formatTanggal(tx.date, false, true)}</td>
            <td><strong>${formatIDR(tx.grandTotal)}</strong></td>
            <td><span class="badge ${tx.method==='Cash'?'badge-success':'badge-warning'}">
                ${tx.method}</span></td>
            <td><span class="badge badge-success">
                <i class="fa-solid fa-circle-check"></i> Selesai</span></td>`;
        tbody.appendChild(tr);
    });
}

// ============================================================
//  CHART
// ============================================================
function initChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], datasets: [{
                label:'Pendapatan', data:[],
                backgroundColor:'rgba(78,54,41,0.1)', borderColor:'#4e3629',
                borderWidth:3, pointBackgroundColor:'#4e3629',
                pointBorderColor:'#ffffff', pointBorderWidth:2,
                pointRadius:5, fill:true, tension:0.4
            }]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins: {
                legend:{display:false},
                tooltip:{callbacks:{label: c => `Pendapatan: ${formatIDR(c.parsed.y)}`}}
            },
            scales: {
                y:{ beginAtZero:true,
                    grid:{color:'rgba(237,231,222,0.5)'},
                    ticks:{callback: v => 'Rp'+v/1000+'k', font:{family:'Inter',size:11}}
                },
                x:{ grid:{display:false}, ticks:{font:{family:'Inter',size:11}} }
            }
        }
    });
}

function updateChart() {
    if (!salesChart) return;
    const hourMap = {};
    transactions.forEach(tx => {
        const jam = (tx.date||'').slice(11,13);
        if (jam) { const l=`${jam}:00`; hourMap[l]=(hourMap[l]||0)+tx.grandTotal; }
    });
    const labels = Object.keys(hourMap).sort();
    salesChart.data.labels           = labels.length ? labels : ['--'];
    salesChart.data.datasets[0].data = labels.length ? labels.map(l=>hourMap[l]) : [0];
    salesChart.update();
}

// ============================================================
//  NAVIGATION ROUTER
// ============================================================
function initNavigationRouter() {
    const navItems  = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target === 'logout') { openModal('logout-modal'); return; }
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${target}`)?.classList.add('active');
            if (pageTitle)
                pageTitle.innerText = target.charAt(0).toUpperCase()+target.slice(1).replace('-',' ');
            if (target === 'dashboard') loadTransaksiHariIni();
            if (target === 'riwayat')   loadRiwayatTransaksi('');
            if (target === 'absensi')   loadRiwayatAbsensi();
            if (target === 'transaksi') applyMenuFilter();
        });
    });
    document.getElementById('view-all-tx-btn')?.addEventListener('click', () =>
        document.querySelector('.nav-item[data-target="riwayat"]')?.click());
}

// ============================================================
//  MODAL & LOGOUT
// ============================================================
function initGeneralModalTriggers() {
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => openModal('logout-modal'));
    document.getElementById('btn-confirm-logout')?.addEventListener('click', () => {
        closeModal('logout-modal');
        localStorage.removeItem('activeUser');
        localStorage.removeItem('activeRole');
        showToast('Sesi ditutup. Sampai jumpa!','warning');
        setTimeout(() => window.location.href = 'login.html', 800);
    });
}

// ============================================================
//  HELPERS
// ============================================================
function formatTanggal(dateStr, dateOnly=false, timeOnly=false) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    if (timeOnly) return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if (dateOnly) return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    return d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function formatIDR(amount) {
    return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0})
        .format(amount).replace(/,00$/,'');
}

function getFormattedDateTime(date) {
    const p = n => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} `
         + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

window.openModal  = id => document.getElementById(id)?.classList.add('active');
window.closeModal = id => document.getElementById(id)?.classList.remove('active');

window.showToast = function(message, type='info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = {success:'fa-circle-check',warning:'fa-triangle-exclamation',
                   danger:'fa-circle-xmark',info:'fa-circle-info'};
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
};

function initRealtimeClock() {
    const clockEl  = document.getElementById('live-time');
    const attClock = document.getElementById('attendance-big-clock');
    const attDate  = document.getElementById('attendance-big-date');
    const DAYS   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                    'Agustus','September','Oktober','November','Desember'];
    function tick() {
        const now  = new Date();
        const tStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const dStr = `${DAYS[now.getDay()]}, ${String(now.getDate()).padStart(2,'0')} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
        if (clockEl)  clockEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${dStr} | ${tStr}`;
        if (attClock) attClock.innerText = tStr;
        if (attDate)  attDate.innerText  = dStr;
    }
    setInterval(tick, 1000); tick();
}

function initMobileSidebar() {
    const btn     = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.querySelector('.sidebar');
    const main    = document.querySelector('.main-wrapper');
    btn?.addEventListener('click', e => { e.stopPropagation(); sidebar?.classList.toggle('mobile-active'); });
    main?.addEventListener('click', () => sidebar?.classList.remove('mobile-active'));
    document.querySelectorAll('.nav-item').forEach(i =>
        i.addEventListener('click', () => sidebar?.classList.remove('mobile-active')));
}

function disableBrowserZooming() {
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && ['=','-','+','0'].includes(e.key)) e.preventDefault();
    });
    document.addEventListener('wheel', e => {
        if (e.ctrlKey) e.preventDefault();
    }, {passive:false});
}