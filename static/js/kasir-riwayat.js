// kasir-riwayat.js - Kelola Riwayat Transaksi Kasir

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
