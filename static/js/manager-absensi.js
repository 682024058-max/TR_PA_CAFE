// manager-absensi.js - Monitoring Absensi Kasir

async function muatAbsensi() {
    try {
        const data  = await ambilDataApi(`${API_BASE}/absensi`);
        ATTENDANCES = data.data || [];
        perbaruiMetrikAbsensi();
        tampilkanTabelAbsensi();
    } catch(e) {
        tampilkanToast('Gagal memuat data absensi: ' + e.message, 'danger');
    }
}

function inisialisasiPengendaliAbsensi() {
    document.getElementById("absensi-search")?.addEventListener("input", tampilkanTabelAbsensi);
    document.getElementById("absensi-filter-date")?.addEventListener("change", tampilkanTabelAbsensi);
    document.getElementById("btn-reset-absensi-filters")?.addEventListener("click", () => {
        const s = document.getElementById("absensi-search");
        const d = document.getElementById("absensi-filter-date");
        if (s) s.value = "";
        if (d) d.value = "";
        tampilkanTabelAbsensi();
    });
    document.getElementById("btn-export-absensi-pdf")?.addEventListener("click", eksporAbsensiKePdf);
    document.getElementById("btn-export-absensi-excel")?.addEventListener("click", eksporAbsensiKeExcel);
}

function perbaruiMetrikAbsensi() {
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

function tampilkanTabelAbsensi() {
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
                <button class="btn-secondary" onclick="lihatDetailAbsensi(${att.id_absensi})" style="padding:6px 12px;font-size:11px">
                    <i class="fa-regular fa-eye"></i> Detail
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.lihatDetailAbsensi = function(id) {
    const att = ATTENDANCES.find(a => a.id_absensi === id);
    if (!att) return;
    document.getElementById("abs-detail-name").textContent   = att.nama_kasir || '-';
    document.getElementById("abs-detail-date").textContent   = (att.date || '').slice(0,10);
    document.getElementById("abs-detail-in").textContent     = att.jam_masuk  ? String(att.jam_masuk).slice(0,8)  : '-';
    document.getElementById("abs-detail-out").textContent    = att.jam_keluar ? String(att.jam_keluar).slice(0,8) : '-';
    document.getElementById("abs-detail-status").innerHTML   = `<span class="badge ${att.status === 'Hadir' ? 'badge-success' : 'badge-warning'}">${att.status || '-'}</span>`;

    const imgIn  = document.getElementById("abs-detail-photo-in");
    const placeholderIn = document.getElementById("abs-detail-photo-in-placeholder");
    if (imgIn && placeholderIn) {
        if (att.foto_masuk) {
            imgIn.src = att.foto_masuk;
            imgIn.style.display = "block";
            placeholderIn.style.display = "none";
        } else {
            imgIn.src = "";
            imgIn.style.display = "none";
            placeholderIn.style.display = "block";
        }
    }

    const imgOut = document.getElementById("abs-detail-photo-out");
    const placeholderOut = document.getElementById("abs-detail-photo-out-placeholder");
    if (imgOut && placeholderOut) {
        if (att.foto_keluar) {
            imgOut.src = att.foto_keluar;
            imgOut.style.display = "block";
            placeholderOut.style.display = "none";
        } else {
            imgOut.src = "";
            imgOut.style.display = "none";
            placeholderOut.style.display = "block";
        }
    }

    bukaModal("absensi-detail-modal");
}

function eksporAbsensiKeExcel() {
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

    eksporKeExcel("Laporan_Kehadiran_Kasir.csv", headers, rows);
    tampilkanToast("Laporan Kehadiran Kasir berhasil diexport ke Excel!", "success");
}

function eksporAbsensiKePdf() {
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

    cetakLaporanHTML("LAPORAN KEHADIRAN KASIR", headers, rows);
}
