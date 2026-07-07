

const API_BASE = '/api';

let SESSION = { id: null, nama: 'Kasir', role: 'kasir' };

let MENU_ITEMS     = [];
let transactions   = [];
let historyTransactions = [];
let attendanceLogs = [];
let cart           = [];
let activeCategory = 'all';
let searchQuery    = '';
let salesChart     = null;
let qrisFotoBase64 = null;
let currentAttendance = {
    status: 'Belum Absen',   
    clockIn: '', clockOut: '', activeDate: '', id_absensi: null
};

const KATEGORI_LABEL = {
    'coffee'    : '☕ Coffee',
    'non-coffee': '🥤 Non Coffee',
    'snack'     : '🍿 Snack',
    'dessert'   : '🍰 Dessert'
};

function headerApi() {
    return {
        'Content-Type': 'application/json',
        'X-User-Role' : SESSION.role,
        'X-User-Id'   : SESSION.id,
        'X-User-Name' : SESSION.nama   
    };
}

function apiHeaders() {
    return headerApi();
}

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
    initReceiptModalClose();
    disableBrowserZooming();
    initChart();

    
    loadKategoriDanProduk();
    loadTransaksiHariIni();
    muatAbsensiHariIni();
    loadRiwayatAbsensi();
});

function initReceiptModalClose() {
    const btnCloseStruk = document.getElementById('btn-close-struk');
    const receiptModal = document.getElementById('receipt-modal');

    if (btnCloseStruk) {
        btnCloseStruk.addEventListener('click', function() {
            closeModal('receipt-modal');
        });
    }

    if (receiptModal) {
        receiptModal.addEventListener('click', function(e) {
            if (e.target === receiptModal) {
                closeModal('receipt-modal');
            }
        });
    }
}

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

async function loadKategoriDanProduk() {
    try {
        const res  = await fetch(`${API_BASE}/kategori`);
        const data = await res.json();
        if (data.status === 'success') {
            (data.data || []).forEach(k => {
                KATEGORI_LABEL[k.id_kategori] = k.nama_kategori;
            });
            tampilkanTabKategori(data.data);
        }
    } catch (e) {
        console.error('Gagal load kategori:', e);
    }
    muatProduk();
}

function tampilkanTabKategori(list) {
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
    inisialisasiFilterPOS();
}

async function muatProduk() {
    const grid = document.getElementById('menu-grid-container');
    if (grid) grid.innerHTML =
        `<div class="empty-cart-box span-2">
            <i class="fa-solid fa-spinner fa-spin"></i><h4>Memuat menu...</h4>
         </div>`;
    try {
        const res  = await fetch(`${API_BASE}/products`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message);

        MENU_ITEMS = data.data.map(p => ({
            id           : p.id_product,
            name         : p.nama_product,
            price        : Number(p.harga),
            category     : p.kategori,
            nama_kategori: KATEGORI_LABEL[p.kategori] || p.kategori,
            foto         : p.foto,
            warna        : p.warna || '#4e3629'
        }));

        tampilkanMenuPOS(MENU_ITEMS);
    } catch (e) {
        console.error('Gagal load produk:', e);
        tampilkanToast('Gagal memuat menu. Pastikan Flask berjalan!', 'danger');
        if (grid) grid.innerHTML =
            `<div class="empty-cart-box span-2">
                <i class="fa-solid fa-plug-circle-xmark"></i>
                <h4>Koneksi Gagal</h4>
                <p>Server Flask (port 5000) tidak dapat dihubungi.</p>
             </div>`;
    }
}

function tampilkanMenuPOS(items) {
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
                <span class="menu-card-price">${formatRupiah(item.price)}</span>
                <button class="btn-add-to-cart" onclick="tambahItemKeKeranjang(${item.id})">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>`;
        grid.appendChild(card);
    });
}

function inisialisasiFilterPOS() {
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
            terapkanFilterMenu();
        });
    }
    const searchInput = document.getElementById('menu-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            searchQuery = e.target.value;
            terapkanFilterMenu();
        });
    }
}

function terapkanFilterMenu() {
    const filtered = MENU_ITEMS.filter(item => {
        const matchCat    = activeCategory === 'all' || item.category === activeCategory;
        const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
    });
    tampilkanMenuPOS(filtered);
}

function initCartInteractions() {
    document.getElementById('btn-reset-cart')?.addEventListener('click', () => {
        if (cart.length > 0) { aturUlangStatusKeranjang(); tampilkanToast('Keranjang dikosongkan', 'success'); }
    });
}

window.tambahItemKeKeranjang = function (itemId) {
    const menu = MENU_ITEMS.find(i => i.id === itemId);
    if (!menu) return;
    const existing = cart.find(i => i.id === itemId);
    if (existing) existing.qty += 1;
    else cart.push({ id: menu.id, name: menu.name, price: menu.price, qty: 1 });
    tampilkanDaftarKeranjang();
    tampilkanToast(`${menu.name} ditambahkan!`, 'success');
};

function tampilkanDaftarKeranjang() {
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
        perbaruiTotalKeranjang(0, 0, 0, 0);
        return;
    }

    cart.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-details">
                <h4 class="cart-item-name">${item.name}</h4>
                <p class="cart-item-price">${formatRupiah(item.price)}</p>
            </div>
            <div class="cart-item-qty-control">
                <button class="btn-qty" onclick="sesuaikanJumlahKeranjang(${item.id},-1)">
                    <i class="fa-solid fa-minus"></i></button>
                <div class="qty-val">${item.qty}</div>
                <button class="btn-qty" onclick="sesuaikanJumlahKeranjang(${item.id},1)">
                    <i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="cart-item-subtotal">${formatRupiah(item.price * item.qty)}</div>
            <button class="btn-delete-item" onclick="hapusItemKeranjang(${item.id})">
                <i class="fa-regular fa-trash-can"></i></button>`;
        container.appendChild(row);
    });

    checkoutBtn?.classList.remove('disabled');
    checkoutBtn?.removeAttribute('disabled');
    checkoutBtn?.classList.add('btn-highlight');
    hitungStatusKeranjang();
}

window.sesuaikanJumlahKeranjang = function (itemId, change) {
    const target = cart.find(i => i.id === itemId);
    if (!target) return;
    target.qty += change;
    if (target.qty < 1) hapusItemKeranjang(itemId);
    else tampilkanDaftarKeranjang();
};

window.hapusItemKeranjang = function (itemId) {
    const idx = cart.findIndex(i => i.id === itemId);
    if (idx > -1) {
        const name = cart[idx].name;
        cart.splice(idx, 1);
        tampilkanDaftarKeranjang();
        tampilkanToast(`${name} dihapus`, 'warning');
    }
};

function aturUlangStatusKeranjang() { cart = []; tampilkanDaftarKeranjang(); }

function hitungStatusKeranjang() {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;
    perbaruiTotalKeranjang(sub, tax, svc, sub);
}

function perbaruiTotalKeranjang(sub, tax, svc, total) {
    document.getElementById('cart-subtotal').innerText    = formatRupiah(sub);
    document.getElementById('cart-tax').innerText         = formatRupiah(tax);
    document.getElementById('cart-service').innerText     = formatRupiah(svc);
    document.getElementById('cart-grand-total').innerText = formatRupiah(total);
}

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

        document.getElementById('payment-grand-total').innerText = formatRupiah(total);
        document.getElementById('payment-grand-total').setAttribute('data-amount', total);
        cashInput.value = '';
        document.getElementById('payment-change').innerText = 'Rp0';
        document.getElementById('insufficient-funds-alert').classList.add('hidden');
        
        
        qrisFotoBase64 = null;
        document.getElementById('qris-proof-section').classList.add('hidden');
        const qrisPreviewImg = document.getElementById('qris-preview-img');
        if (qrisPreviewImg) {
            qrisPreviewImg.src = '';
            qrisPreviewImg.classList.add('hidden');
        }
        document.getElementById('qris-preview-placeholder')?.classList.remove('hidden');

        document.querySelector('input[name="payment_method"][value="Cash"]').checked = true;
        methodCards.forEach(c => c.classList.remove('active'));
        document.querySelector('.method-card[data-method="Cash"]').classList.add('active');
        document.getElementById('cash-calculator-section').classList.remove('hidden');
        document.getElementById('change-display-box').classList.remove('hidden');
        bukaModal('payment-modal');
        setTimeout(() => cashInput.focus(), 200);
    });

    document.querySelectorAll('.btn-quick-cash').forEach(btn => {
        btn.addEventListener('click', () => {
            const total = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
            cashInput.value = btn.getAttribute('data-amount') === 'exact'
                ? total : parseInt(btn.getAttribute('data-amount'));
            hitungKembalian(total);
        });
    });

    cashInput?.addEventListener('input', () =>
        hitungKembalian(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'))));

    methodCards.forEach(card => {
        card.addEventListener('click', () => {
            methodCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type="radio"]').checked = true;
            const isNonCash = card.querySelector('input').value !== 'Cash';
            const isQRIS = card.querySelector('input').value === 'QRIS';
            
            document.getElementById('cash-calculator-section').classList.toggle('hidden', isNonCash);
            document.getElementById('change-display-box').classList.toggle('hidden', isNonCash);
            document.getElementById('qris-proof-section').classList.toggle('hidden', !isQRIS);
            document.getElementById('insufficient-funds-alert').classList.add('hidden');
            
            if (!isNonCash)
                hitungKembalian(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount')));
        });
    });

    
    const btnTakeQrisPhoto = document.getElementById('btn-take-qris-photo');

    btnTakeQrisPhoto?.addEventListener('click', async () => {
        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-camera"></i> Ambil Foto Bukti Transfer';

        currentFacingMode = 'environment';
        const flipBtn = document.getElementById('btn-flip-camera');
        if (flipBtn) flipBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Kamera Depan';

        await mulaiKamera();

        const btnCapture = document.getElementById('btn-capture-absensi');
        const newBtn = btnCapture.cloneNode(true);
        btnCapture.parentNode.replaceChild(newBtn, btnCapture);

        newBtn.addEventListener('click', () => {
            const foto = ambilFotoKamera();
            if (!foto) { tampilkanToast('Gagal mengambil foto', 'danger'); return; }
            hentikanKamera();
            tutupModal('camera-modal');

            qrisFotoBase64 = foto;
            const previewImg = document.getElementById('qris-preview-img');
            const previewPlaceholder = document.getElementById('qris-preview-placeholder');
            if (previewImg && previewPlaceholder) {
                previewImg.src = foto;
                previewImg.classList.remove('hidden');
                previewPlaceholder.classList.add('hidden');
            }
        });
    });

    document.getElementById('btn-process-payment')?.addEventListener('click', prosesCheckoutAktif);
}

function hitungKembalian(grandTotal) {
    const cash = parseInt(document.getElementById('cash-tendered').value) || 0;
    const chg  = cash - grandTotal;
    document.getElementById('payment-change').innerText = chg >= 0 ? formatRupiah(chg) : 'Rp0';
    document.getElementById('insufficient-funds-alert')
        .classList.toggle('hidden', cash === 0 || chg >= 0);
}

async function prosesCheckoutAktif() {
    const grandTotal = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
    const method     = document.querySelector('input[name="payment_method"]:checked').value;
    const cashInput  = document.getElementById('cash-tendered');
    let cashPaid = grandTotal, change = 0;

    if (method === 'Cash') {
        cashPaid = parseInt(cashInput.value) || 0;
        if (cashPaid < grandTotal) {
            tampilkanToast('Uang tunai tidak cukup!', 'danger');
            document.getElementById('insufficient-funds-alert').classList.remove('hidden');
            document.querySelector('.payment-modal-content').classList.add('modal-shake');
            setTimeout(() =>
                document.querySelector('.payment-modal-content').classList.remove('modal-shake'), 500);
            return;
        }
        change = cashPaid - grandTotal;
    } else if (method === 'QRIS') {
        if (!qrisFotoBase64) {
            tampilkanToast('Bukti transfer QRIS wajib diambil!', 'danger');
            document.querySelector('.payment-modal-content').classList.add('modal-shake');
            setTimeout(() =>
                document.querySelector('.payment-modal-content').classList.remove('modal-shake'), 500);
            return;
        }
    }

    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;

    const payload = {
        id_user           : SESSION.id,
        total_harga       : grandTotal,
        uang_bayar        : cashPaid,
        kembalian         : change,
        metode_pembayaran : method,
        items: cart.map(i => ({
            id_product: i.id,
            qty       : i.qty,
            subtotal  : i.price * i.qty
        }))
    };

    if (method === 'QRIS' && qrisFotoBase64) {
        payload.foto_bukti_tf = qrisFotoBase64;
    }

    const btnProcess = document.getElementById('btn-process-payment');
    btnProcess.setAttribute('disabled','true');
    btnProcess.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    try {
        const res  = await fetch(`${API_BASE}/transaksi`, {
            method:'POST', headers: headerApi(), body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            const txForReceipt = {
                id: data.id_transaksi,
                txId: `TX-${String(data.id_transaksi).padStart(6,'0')}`,
                date: ambilFormatTanggalWaktu(new Date()),
                cashier: SESSION.nama,
                items: [...cart],
                subtotal: sub, tax: 0, service: 0,
                grandTotal, method, cashPaid, change
            };
            tutupModal('payment-modal');
            aturUlangStatusKeranjang();
            tampilkanToast('Transaksi Berhasil Diproses!', 'success');
            await loadTransaksiHariIni();
            setTimeout(() => simulasikanCetakStruk(txForReceipt), 400);
        } else {
            tampilkanToast(data.message || 'Gagal menyimpan transaksi!', 'danger');
        }
    } catch (e) {
        console.error(e);
        tampilkanToast('Gagal terhubung ke server!', 'danger');
    } finally {
        btnProcess.removeAttribute('disabled');
        btnProcess.innerHTML = '<i class="fa-solid fa-square-check"></i> Proses Pembayaran';
    }
}

function simulasikanCetakStruk(tx, isReprint = false) {
    document.getElementById('print-loading-overlay')?.classList.add('hidden');
    bukaModal('receipt-modal');
    
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
    document.getElementById('receipt-subtotal').innerText    = formatRupiah(tx.subtotal);
    document.getElementById('receipt-tax').innerText         = formatRupiah(tx.tax);
    document.getElementById('receipt-service').innerText     = formatRupiah(tx.service);
    document.getElementById('receipt-grand-total').innerText = formatRupiah(tx.grandTotal);
    document.getElementById('receipt-method').innerText      = tx.method;
    document.getElementById('receipt-cash-paid').innerText   = formatRupiah(tx.cashPaid);
    document.getElementById('receipt-change').innerText      = formatRupiah(tx.change);

    const tbody = document.getElementById('receipt-items-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        tx.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td align="left">${item.name}
                    <br><small style="color:#666">@${formatRupiah(item.price)}</small></td>
                <td align="center">${item.qty}</td>
                <td align="right">${formatRupiah(item.price * item.qty)}</td>`;
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
                tutupModal('receipt-modal');
            }
        });
    }
}

async function loadTransaksiHariIni() {
    const dObj = new Date();
    const year = dObj.getFullYear();
    const month = String(dObj.getMonth() + 1).padStart(2, '0');
    const date = String(dObj.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${date}`;
    try {
        const res  = await fetch(`${API_BASE}/transaksi?tanggal=${today}`, { headers: headerApi() });
        const data = await res.json();
        if (data.status === 'success') {
            transactions = data.data.map(tx => ({
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
            perbaruiMetrikDashboard();
            tampilkanTabelTransaksiTerbaru();
            perbaruiGrafik();
        }
    } catch (e) { console.error('Gagal load transaksi:', e); }
}

async function loadRiwayatTransaksi(selectedDate = '') {
    try {
        let url = `${API_BASE}/transaksi`;
        if (selectedDate) {
            url += `?tanggal=${selectedDate}`;
        }
        const res  = await fetch(url, { headers: headerApi() });
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

function tampilkanTabelRiwayatTransaksi(txArray) {
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
            <td><strong>${formatRupiah(tx.grandTotal)}</strong></td>
            <td><span class="badge ${badgeClass}">
                <i class="fa-solid ${iconMap[tx.method]||'fa-wallet'}"></i> ${tx.method}</span></td>
            <td><span class="badge badge-success">
                <i class="fa-solid fa-circle-check"></i> Selesai</span></td>
            <td style="text-align:center">
                <div class="action-cell-buttons">
                    <button class="btn-table-action btn-detail"
                        onclick="bukaDetailTransaksi(${tx.id})">
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
        tampilkanTabelRiwayatTransaksi(filtered);
    }

    window.applyHistoryFilters = apply;

    txSearch?.addEventListener('input', apply);
    txDate?.addEventListener('change', onDateChange);
    txPayment?.addEventListener('change', apply);
    btnReset?.addEventListener('click', async () => {
        txSearch.value=''; txDate.value=''; txPayment.value='all';
        await loadRiwayatTransaksi('');
        tampilkanToast('Filter direset','success');
    });
}

window.bukaDetailTransaksi = window.openTransactionDetails = async function (txId) {
    try {
        const res  = await fetch(`${API_BASE}/transaksi/${txId}`, { headers: headerApi() });
        const data = await res.json();
        if (data.status !== 'success') { tampilkanToast('Gagal load detail','danger'); return; }

        const tx    = data.data;
        const items = tx.items || [];
        const sub   = items.reduce((s, i) => s + Number(i.subtotal), 0);
        const tax   = 0;
        const svc   = 0;

        document.getElementById('detail-tx-id').innerText        = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        document.getElementById('detail-tx-date').innerText      = formatTanggal(tx.tanggal_transaksi);
        document.getElementById('detail-tx-method').innerText    = tx.metode_pembayaran;
        document.getElementById('detail-tx-cashier').innerText   = tx.nama_kasir || SESSION.nama;
        document.getElementById('detail-tx-subtotal').innerText  = formatRupiah(sub);
        document.getElementById('detail-tx-tax').innerText       = formatRupiah(tax);
        document.getElementById('detail-tx-service').innerText   = formatRupiah(svc);
        document.getElementById('detail-tx-grand-total').innerText = formatRupiah(Number(tx.total_harga));

        const tbody = document.getElementById('detail-tx-items-tbody');
        tbody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.nama_product}</strong></td>
                <td style="text-align:center">${item.qty}</td>
                <td style="text-align:right">${formatRupiah(Number(item.harga_satuan))}</td>
                <td style="text-align:right"><strong>${formatRupiah(Number(item.subtotal))}</strong></td>`;
            tbody.appendChild(tr);
        });

        const qrisProofSection = document.getElementById('detail-tx-qris-proof-section');
        if (qrisProofSection) {
            if (tx.metode_pembayaran === 'QRIS' && tx.bukti_tf) {
                document.getElementById('detail-tx-qris-img').src = tx.bukti_tf;
                document.getElementById('detail-tx-qris-link').href = tx.bukti_tf;
                qrisProofSection.classList.remove('hidden');
            } else {
                qrisProofSection.classList.add('hidden');
            }
        }

        bukaModal('tx-detail-modal');

        const reprintBtn = document.getElementById('btn-reprint-from-detail');
        const newBtn = reprintBtn.cloneNode(true);
        reprintBtn.parentNode.replaceChild(newBtn, reprintBtn);
        newBtn.addEventListener('click', () => {
            tutupModal('tx-detail-modal');
            setTimeout(() => simulasikanCetakStruk({
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
        tampilkanToast('Gagal load detail transaksi','danger');
    }
};

async function muatAbsensiHariIni() {
    if (!SESSION.nama) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const res  = await fetch(`${API_BASE}/absensi?tanggal=${today}`, { headers: headerApi() });
        const data = await res.json();
        if (data.status === 'success' && data.data.length > 0) {
            const abs = data.data[0];
            currentAttendance.id_absensi = abs.id_absensi;
            currentAttendance.clockIn    = (abs.jam_masuk  || '').slice(0, 8);
            currentAttendance.clockOut   = (abs.jam_keluar || '').slice(0, 8);
            currentAttendance.activeDate = today;
            currentAttendance.status     = abs.jam_keluar ? 'Selesai Shift' : 'Aktif Bekerja';
            perbaruiUIAbsensi();
        }
    } catch (e) { console.error('Gagal load absensi hari ini:', e); }
}

async function loadRiwayatAbsensi() {
    if (!SESSION.nama) return;
    try {
        const res  = await fetch(`${API_BASE}/absensi`, { headers: headerApi() });
        const data = await res.json();
        if (data.status === 'success') { attendanceLogs = data.data; tampilkanLogAbsensi(); }
    } catch (e) { console.error('Gagal load riwayat absensi:', e); }
}

let webcamStream = null;
let currentFacingMode = 'environment';

async function mulaiKamera() {
    const video = document.getElementById('webcam-video');
    const loading = document.getElementById('camera-loading-placeholder');
    const errorEl = document.getElementById('camera-error-placeholder');

    if (!video) return;

    if (loading) loading.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';

    video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: currentFacingMode },
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

function hentikanKamera() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    const video = document.getElementById('webcam-video');
    if (video) video.srcObject = null;
}

async function flipKamera() {
    hentikanKamera();
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    const btn = document.getElementById('btn-flip-camera');
    if (btn) btn.innerHTML = currentFacingMode === 'user'
        ? '<i class="fa-solid fa-rotate"></i> Kamera Belakang'
        : '<i class="fa-solid fa-rotate"></i> Kamera Depan';
    await mulaiKamera();
}
window.flipKamera = flipKamera;

function ambilFotoKamera() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    if (!video || !canvas || !webcamStream) return null;
    
    const context = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    
    context.drawImage(video, 0, 0, 640, 480);
    
    context.font = "bold 18px Arial, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";
    context.lineWidth = 4;
    
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const text1 = `KOPI SIBEI - ${timestamp}`;
    
    context.strokeText(text1, 20, 450);
    context.fillText(text1, 20, 450);
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

window.closeCameraModal = function() {
    hentikanKamera();
    tutupModal('camera-modal');
};

function initAttendanceInteractions() {
    
    document.getElementById('btn-clock-in')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Belum Absen') return;
        if (!SESSION.nama) { tampilkanToast('Session tidak ditemukan, login ulang','danger'); return; }

        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Foto Absen Masuk';
        }
        
        await mulaiKamera();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = ambilFotoKamera();
                if (!photo) {
                    tampilkanToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/masuk`, {
                        method : 'POST',
                        headers: headerApi(),
                        body   : JSON.stringify({ 
                            nama_kasir: SESSION.nama,
                            foto: photo 
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.status     = 'Aktif Bekerja';
                        currentAttendance.clockIn    = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.activeDate = new Date().toISOString().slice(0, 10);
                        currentAttendance.id_absensi = data.id_absensi;
                        perbaruiUIAbsensi();
                        tampilkanToast('Absen Masuk berhasil dicatat!','success');
                        hentikanKamera();
                        tutupModal('camera-modal');
                        loadRiwayatAbsensi();
                    } else {
                        tampilkanToast(data.message || 'Gagal absen masuk','danger');
                    }
                } catch (e) { 
                    console.error(e);
                    tampilkanToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });

    
    document.getElementById('btn-clock-out')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Aktif Bekerja') return;
        if (!sudahBekerjaDelapanJam()) {
            tampilkanToast('Anda belum mencapai 8 jam kerja!', 'warning');
            return;
        }

        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Foto Absen Pulang';
        }
        
        await mulaiKamera();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = ambilFotoKamera();
                if (!photo) {
                    tampilkanToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/keluar`, {
                        method : 'PUT',
                        headers: headerApi(),
                        body   : JSON.stringify({
                            id_absensi: currentAttendance.id_absensi,
                            foto: photo
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.clockOut = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.status   = 'Selesai Shift';
                        perbaruiUIAbsensi();
                        tampilkanToast('Absen Pulang dicatat. Selamat beristirahat!','success');
                        hentikanKamera();
                        tutupModal('camera-modal');
                        loadRiwayatAbsensi();
                    } else {
                        tampilkanToast(data.message || 'Gagal absen keluar','danger');
                    }
                } catch (e) { 
                    console.error(e);
                    tampilkanToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });
}

function sudahBekerjaDelapanJam() {
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

function perbaruiUIAbsensi() {
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

function tampilkanLogAbsensi() {
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

function perbaruiMetrikDashboard() {
    document.getElementById('stat-total-tx').innerText =
        transactions.length;
    document.getElementById('stat-revenue').innerText =
        formatRupiah(transactions.reduce((s, t) => s + t.grandTotal, 0));
    document.getElementById('stat-items-sold').innerText =
        `${transactions.length} Transaksi`;
    loadTopMenuAllTime();
}

async function loadTopMenuAllTime() {
    const el = document.getElementById('stat-top-menu');
    if (!el) return;
    el.innerText = '...';
    try {
        const res  = await fetch(`${API_BASE}/transaksi?all_cashiers=true`, { headers: headerApi() });
        const data = await res.json();
        if (data.status !== 'success' || !data.data.length) {
            el.innerText = '-'; return;
        }
        const allTx = data.data;

        const detailResults = await Promise.all(
            allTx.map(tx =>
                fetch(`${API_BASE}/transaksi/${tx.id_transaksi}`, { headers: headerApi() })
                    .then(r => r.json()).catch(() => null)
            )
        );

        const qtyMap = {};
        detailResults.forEach(resp => {
            if (!resp || resp.status !== 'success') return;
            const items = resp.data?.items || [];
            items.forEach(item => {
                const nama = item.nama_product || 'Unknown';
                qtyMap[nama] = (qtyMap[nama] || 0) + Number(item.qty || 1);
            });
        });

        const entries = Object.entries(qtyMap);
        if (!entries.length) { el.innerText = '-'; return; }
        entries.sort((a, b) => b[1] - a[1]);
        const [topName, topQty] = entries[0];
        el.innerText = topName;

        const metaEl = el.closest('.stat-info')?.querySelector('.stat-meta');
        if (metaEl) metaEl.textContent = `Terjual ${topQty}× (All Time)`;

    } catch (e) {
        console.error('Gagal load top menu:', e);
        el.innerText = '-';
    }
}

function tampilkanTabelTransaksiTerbaru() {
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
            <td><strong>${formatRupiah(tx.grandTotal)}</strong></td>
            <td><span class="badge ${tx.method==='Cash'?'badge-success':'badge-warning'}">
                ${tx.method}</span></td>
            <td><span class="badge badge-success">
                <i class="fa-solid fa-circle-check"></i> Selesai</span></td>`;
        tbody.appendChild(tr);
    });
}

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
                tooltip:{callbacks:{label: c => `Pendapatan: ${formatRupiah(c.parsed.y)}`}}
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

function perbaruiGrafik() {
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

function initNavigationRouter() {
    const navItems  = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target === 'logout') { bukaModal('logout-modal'); return; }
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${target}`)?.classList.add('active');
            if (pageTitle)
                pageTitle.innerText = target.charAt(0).toUpperCase()+target.slice(1).replace('-',' ');
            if (target === 'dashboard') loadTransaksiHariIni();
            if (target === 'riwayat')   loadRiwayatTransaksi('');
            if (target === 'absensi')   loadRiwayatAbsensi();
            if (target === 'transaksi') terapkanFilterMenu();
        });
    });
    document.getElementById('view-all-tx-btn')?.addEventListener('click', () =>
        document.querySelector('.nav-item[data-target="riwayat"]')?.click());
}

function initGeneralModalTriggers() {
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => bukaModal('logout-modal'));
    document.getElementById('btn-confirm-logout')?.addEventListener('click', () => {
        tutupModal('logout-modal');
        localStorage.removeItem('activeUser');
        localStorage.removeItem('activeRole');
        tampilkanToast('Sesi ditutup. Sampai jumpa!','warning');
        setTimeout(() => window.location.href = 'login.html', 800);
    });
}

function formatTanggal(dateStr, dateOnly=false, timeOnly=false) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    if (timeOnly) return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if (dateOnly) return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    return d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0})
        .format(amount).replace(/,00$/,'');
}

function ambilFormatTanggalWaktu(date) {
    const p = n => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} `
         + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

window.bukaModal  = function(id) { document.getElementById(id)?.classList.add('active'); };
window.tutupModal = function(id) { document.getElementById(id)?.classList.remove('active'); };
window.openModal = window.bukaModal;
window.closeModal = window.tutupModal;

window.tampilkanToast = function(message, type='info') {
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
window.showToast = window.tampilkanToast;
window.formatIDR = window.formatRupiah;

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