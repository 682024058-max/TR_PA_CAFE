// kasir-dashboard.js - POS Interface, Realtime Stats & Navigation

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
