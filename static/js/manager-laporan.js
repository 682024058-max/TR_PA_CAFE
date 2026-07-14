// manager-laporan.js - Laporan Penjualan & Dashboard Metrics

async function muatDataDashboard() {
    try {
        const [txData, usersData] = await Promise.all([
            ambilDataApi(`${API_BASE}/transaksi`),
            ambilDataApi(`${API_BASE}/users`)
        ]);
        TRANSACTIONS = txData.data   || [];
        CASHIERS     = (usersData.data || []).filter(u => u.role === 'kasir');

        perbaruiMetrikDashboard();
        tampilkanTabelTransaksiTerbaru();
        perbaruiGrafik();
    } catch(e) {
        console.error('Dashboard load error:', e);
        tampilkanToast('Gagal memuat data dashboard: ' + e.message, 'danger');
    }
}

function perbaruiMetrikDashboard() {
    const totalRevenue = TRANSACTIONS.reduce((s, t) => s + Number(t.total_harga || 0), 0);

    const revEl     = document.getElementById("stat-revenue");
    const txEl      = document.getElementById("stat-total-tx");
    const cashierEl = document.getElementById("stat-total-cashiers");
    const topMenuEl = document.getElementById("stat-top-menu");

    if (revEl)     revEl.textContent     = formatRupiah(totalRevenue);
    if (txEl)      txEl.textContent      = TRANSACTIONS.length;
    if (cashierEl) cashierEl.textContent = CASHIERS.length;
    if (topMenuEl) { topMenuEl.textContent = '...'; muatMenuTeratasSemuaWaktu(topMenuEl); }
}

async function muatMenuTeratasSemuaWaktu(el) {
    try {
        const recent  = TRANSACTIONS.slice(0, 30);
        const details = await Promise.all(
            recent.map(tx => ambilDataApi(`${API_BASE}/transaksi/${tx.id_transaksi}`).catch(() => null))
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

function tampilkanTabelTransaksiTerbaru() {
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
        const sub    = total;
        const taxSvc = 0;
        const time   = (tx.tanggal_transaksi || '').slice(11, 19) || '-';
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${txId}</code></td>
            <td>${time}</td>
            <td>${tx.nama_kasir || '-'}</td>
            <td>${formatRupiah(sub)}</td>
            <td style="display: none;">${formatRupiah(taxSvc)}</td>
            <td><strong>${formatRupiah(total)}</strong></td>
            <td><span class="badge ${tx.metode_pembayaran === 'Cash' ? 'badge-success' : 'badge-warning'}">${tx.metode_pembayaran || '-'}</span></td>
            <td><span class="badge badge-success">Selesai</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function inisialisasiGrafik() {
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

async function perbaruiGrafik() {
    if (!revenueChart || !weeklyChart) return;
    try {
        const end   = new Date();
        const start = new Date(); start.setDate(start.getDate() - 6);
        const dari   = start.toISOString().slice(0, 10);
        const sampai = end.toISOString().slice(0, 10);

        const data = await ambilDataApi(`${API_BASE}/laporan/harian?dari=${dari}&sampai=${sampai}`);
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

async function muatTransaksi() {
    try {
        const data   = await ambilDataApi(`${API_BASE}/transaksi`);
        TRANSACTIONS = data.data || [];
        perbaruiMetrikLaporan();
        tampilkanTabelLaporan();
    } catch(e) {
        tampilkanToast('Gagal memuat data transaksi: ' + e.message, 'danger');
    }
}

function inisialisasiPengendaliLaporan() {
    const ids = ["report-search","report-date-start","report-date-end","report-payment-method"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', tampilkanTabelLaporan);
    });
    document.getElementById("btn-reset-report-filters")?.addEventListener("click", () => {
        document.getElementById("report-search")?.["value"] !== undefined && (document.getElementById("report-search").value = "");
        document.getElementById("report-date-start") && (document.getElementById("report-date-start").value = "");
        document.getElementById("report-date-end")   && (document.getElementById("report-date-end").value   = "");
        const pm = document.getElementById("report-payment-method");
        if (pm) pm.value = "all";
        perbaruiMetrikLaporan();
        tampilkanTabelLaporan();
    });
    document.getElementById("btn-export-pdf")?.addEventListener("click", eksporLaporanKePdf);
    document.getElementById("btn-export-excel")?.addEventListener("click", eksporLaporanKeExcel);
    document.getElementById("btn-email-report")?.addEventListener("click", kirimLaporanEmail);
}

function perbaruiMetrikLaporan() {
    const total   = TRANSACTIONS.reduce((s, t) => s + Number(t.total_harga || 0), 0);
    const revEl   = document.getElementById("report-total-revenue");
    const txEl    = document.getElementById("report-total-tx-count");
    const topEl   = document.getElementById("report-top-cashier");
    if (revEl) revEl.textContent = formatRupiah(total);
    if (txEl)  txEl.textContent  = TRANSACTIONS.length;
    if (topEl) {
        const cMap = {};
        TRANSACTIONS.forEach(tx => { const n = tx.nama_kasir || '-'; cMap[n] = (cMap[n]||0)+1; });
        const top = Object.entries(cMap).sort((a,b) => b[1]-a[1])[0];
        topEl.textContent = top ? top[0] : '-';
    }
}

function tampilkanTabelLaporan() {
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

    const filteredRevenue = filtered.reduce((s,t) => s + Number(t.total_harga||0), 0);
    const revEl = document.getElementById("report-total-revenue");
    const txEl  = document.getElementById("report-total-tx-count");
    if (revEl) revEl.textContent = formatRupiah(filteredRevenue);
    if (txEl)  txEl.textContent  = filtered.length;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Tidak ada data transaksi ditemukan.</td></tr>`;
        return;
    }
    filtered.forEach(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = total;
        const taxSvc = 0;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${txId}</code></td>
            <td>${dateStr}</td>
            <td>${tx.nama_kasir || '-'}</td>
            <td>${formatRupiah(sub)}</td>
            <td style="display: none;">${formatRupiah(taxSvc)}</td>
            <td><strong>${formatRupiah(total)}</strong></td>
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
        const data  = await ambilDataApi(`${API_BASE}/transaksi/${id}`);
        const tx    = data.data;
        const items = tx.items || [];
        const sub   = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        const tax   = 0;
        const svc   = 0;
        const txId  = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const dateStr = (tx.tanggal_transaksi || '').slice(0,19).replace('T',' ');

        document.getElementById("tx-detail-id").textContent         = txId;
        document.getElementById("tx-detail-date").textContent       = dateStr;
        document.getElementById("tx-detail-cashier").textContent    = tx.nama_kasir || '-';
        document.getElementById("tx-detail-method").textContent     = tx.metode_pembayaran || '-';
        document.getElementById("tx-detail-subtotal").textContent   = formatRupiah(sub);
        document.getElementById("tx-detail-tax").textContent        = formatRupiah(tax);
        document.getElementById("tx-detail-service").textContent    = formatRupiah(svc);
        document.getElementById("tx-detail-grand-total").textContent = formatRupiah(Number(tx.total_harga));

        const tbody = document.getElementById("tx-detail-items-tbody");
        if (tbody) {
            tbody.innerHTML = "";
            items.forEach(item => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${item.nama_product || '-'}</strong></td>
                    <td style="text-align:right">${formatRupiah(Number(item.harga_satuan || 0))}</td>
                    <td style="text-align:center">${item.qty}</td>
                    <td style="text-align:right"><strong>${formatRupiah(Number(item.subtotal || 0))}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        }

        const qrisProofSection = document.getElementById('tx-detail-qris-proof-section');
        if (qrisProofSection) {
            if (tx.metode_pembayaran === 'QRIS' && tx.bukti_tf) {
                document.getElementById('tx-detail-qris-img').src = tx.bukti_tf;
                document.getElementById('tx-detail-qris-link').href = tx.bukti_tf;
                qrisProofSection.classList.remove('hidden');
            } else {
                qrisProofSection.classList.add('hidden');
            }
        }

        bukaModal("tx-detail-modal");
    } catch(e) {
        tampilkanToast("Gagal load detail transaksi: " + e.message, "danger");
    }
}

function eksporLaporanKeExcel() {
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

    const headers = ["ID Transaksi", "Tanggal & Waktu", "Kasir", "Subtotal", "Total Akhir", "Metode Pembayaran", "Status"];
    const rows = filtered.map(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = total;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        return [
            txId,
            dateStr,
            tx.nama_kasir || '-',
            formatRupiah(sub),
            formatRupiah(total),
            tx.metode_pembayaran || '-',
            "Selesai"
        ];
    });

    eksporKeExcel("Laporan_Penjualan_Cafe.csv", headers, rows);
    tampilkanToast("Laporan Penjualan berhasil diexport ke Excel!", "success");
}

function eksporLaporanKePdf() {
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

    const headers = ["ID Transaksi", "Tanggal & Waktu", "Kasir", "Subtotal", "Total Akhir", "Metode", "Status"];
    const rows = filtered.map(tx => {
        const txId   = `TX-${String(tx.id_transaksi).padStart(6,'0')}`;
        const total  = Number(tx.total_harga || 0);
        const sub    = total;
        const dateStr = (tx.tanggal_transaksi || '').slice(0, 19).replace('T',' ');
        return [
            txId,
            dateStr,
            tx.nama_kasir || '-',
            formatRupiah(sub),
            formatRupiah(total),
            tx.metode_pembayaran || '-',
            "Selesai"
        ];
    });

    cetakLaporanHTML("LAPORAN DETIL TRANSAKSI PENJUALAN", headers, rows);
}

async function kirimLaporanEmail() {
    const btn = document.getElementById("btn-email-report");
    if (!btn) return;

    const dateStart = document.getElementById("report-date-start")?.value || "";
    const dateEnd   = document.getElementById("report-date-end")?.value   || "";

    const originalText = btn.innerHTML;
    btn.setAttribute("disabled", "true");
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

    try {
        const result = await ambilDataApi(`${API_BASE}/report/email`, {
            method: "POST",
            body: JSON.stringify({
                start_date: dateStart,
                end_date: dateEnd
            })
        });

        if (result.status === "warning") {
            tampilkanToast(result.message, "warning");
        } else {
            tampilkanToast(result.message || "Laporan penjualan berhasil dikirim ke email!", "success");
        }
    } catch (e) {
        console.error(e);
        tampilkanToast(e.message || "Gagal mengirimkan laporan ke email.", "danger");
    } finally {
        btn.removeAttribute("disabled");
        btn.innerHTML = originalText;
    }
}
