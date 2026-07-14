// manager-payroll.js - Penggajian & Slip Gaji Kasir

async function muatPenggajian() {
    try {
        const data = await ambilDataApi(`${API_BASE}/payroll`);
        PAYROLL = data.data || [];
    } catch(e) {
        tampilkanToast('Gagal memuat data penggajian: ' + e.message, 'danger');
    }
}

function inisialisasiPengendaliPenggajian() {
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
            isiPilihanKasirPenggajian();
            bukaModal("payroll-modal");
            setTimeout(picuHitungOtomatisShift, 200);
        });
    }
    
    document.getElementById("payroll-form-cashier")?.addEventListener("change", picuHitungOtomatisShift);
    document.getElementById("payroll-form-period")?.addEventListener("change", picuHitungOtomatisShift);

    if (search)      search.addEventListener("input", tampilkanTabelPenggajian);
    if (filterMonth) filterMonth.addEventListener("change", tampilkanTabelPenggajian);
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (search) search.value = "";
            if (filterMonth) filterMonth.value = "";
            tampilkanTabelPenggajian(); perbaruiMetrikPenggajian();
        });
    }
    if (exportBtn) exportBtn.addEventListener("click", eksporPenggajianKeExcel);
}

async function picuHitungOtomatisShift() {
    const cashier = document.getElementById("payroll-form-cashier")?.value;
    const period  = document.getElementById("payroll-form-period")?.value;
    const shiftsInput = document.getElementById("payroll-form-shifts");
    
    if (!cashier || !period) return;
    
    if (shiftsInput) {
        shiftsInput.value = "";
        shiftsInput.placeholder = "Menghitung...";
    }
    
    try {
        const res = await ambilDataApi(`${API_BASE}/payroll/calculate-shifts?cashier=${encodeURIComponent(cashier)}&period=${period}`);
        if (shiftsInput) {
            shiftsInput.value = res.total_shifts || 0;
            shiftsInput.placeholder = "Contoh: 22";
            recalcPayroll();
        }
    } catch (e) {
        console.error(e);
        tampilkanToast("Gagal menghitung shift otomatis: " + e.message, "danger");
        if (shiftsInput) {
            shiftsInput.placeholder = "Gagal memuat";
        }
    }
}

function isiPilihanKasirPenggajian() {
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
    if (el) el.textContent = formatRupiah(rate * shifts);
}

function perbaruiMetrikPenggajian() {
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
    if (tEl) tEl.textContent = formatRupiah(totalAmount);
    if (cEl) cEl.textContent = uniqueCashiers.size;
    if (pEl) pEl.textContent = paidCount;
    if (uEl) uEl.textContent = unpaidCount;
}

function tampilkanTabelPenggajian() {
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
        const statusBadge = p.buktiTF 
            ? `<span class="badge badge-success" style="cursor:pointer;" onclick="toggleStatusBayar(${p.id})" title="Klik untuk ubah status"><i class="fa-solid fa-circle-check"></i> Sudah Dibayar</span>`
            : `<span class="badge badge-warning" style="cursor:pointer;" onclick="toggleStatusBayar(${p.id})" title="Klik untuk ubah status"><i class="fa-solid fa-clock"></i> Belum Dibayar</span>`;
        tr.innerHTML = `
            <td><strong>${p.cashier}</strong></td>
            <td>${periodLabel}</td>
            <td>${formatRupiah(p.ratePerShift || 75000)}</td>
            <td style="text-align:center"><strong>${p.totalShifts || 0}</strong> shift</td>
            <td><strong>${formatRupiah(p.totalSalary)}</strong></td>
            <td style="text-align:center">${statusBadge}</td>
            <td style="text-align:center">
                <button class="btn-secondary"  onclick="editPenggajian(${p.id})"     style="padding:6px 10px;font-size:11px;margin-right:4px"><i class="fa-solid fa-pencil"></i> Edit</button>
                <button class="btn-slip-send"  onclick="openSlipGaji(${p.id})"   style="margin-right:4px"><i class="fa-solid fa-envelope"></i> Kirim</button>
                <button class="btn-danger"     onclick="deletePayroll(${p.id})"  style="padding:6px 10px;font-size:11px"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    perbaruiMetrikPenggajian();
}

window.editPenggajian = function(id) {
    const p = PAYROLL.find(x => x.id === id);
    if (!p) return;
    isiPilihanKasirPenggajian();
    document.getElementById("payroll-form-id").value       = p.id;
    document.getElementById("payroll-form-cashier").value  = p.cashier;
    document.getElementById("payroll-form-period").value   = p.period;
    document.getElementById("payroll-form-rate").value     = p.ratePerShift || 75000;
    document.getElementById("payroll-form-shifts").value   = p.totalShifts || 0;
    document.getElementById("payroll-total-display").textContent = formatRupiah(p.totalSalary);
    document.getElementById("payroll-modal-title").textContent   = "Edit Data Gaji Kasir";
    bukaModal("payroll-modal");
    setTimeout(picuHitungOtomatisShift, 200);
}

window.deletePayroll = async function(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus data penggajian ini?")) return;
    try {
        await ambilDataApi(`${API_BASE}/payroll/${id}`, { method: 'DELETE' });
        tampilkanToast("Data penggajian berhasil dihapus!", "success");
        await muatPenggajian();
        tampilkanTabelPenggajian();
    } catch(e) {
        tampilkanToast("Gagal menghapus data penggajian: " + e.message, "danger");
    }
}

window.toggleStatusBayar = async function(id) {
    const p = PAYROLL.find(x => x.id === id);
    if (!p) return;
    const isPaid = !!p.buktiTF;
    try {
        if (isPaid) {
            await ambilDataApi(`${API_BASE}/payroll/${id}/bukti`, { method: 'DELETE' });
            tampilkanToast("Status penggajian diubah menjadi Belum Dibayar.", "success");
        } else {
            await ambilDataApi(`${API_BASE}/payroll/${id}/upload-bukti`, {
                method: 'POST',
                body: JSON.stringify({ buktiTF: "LUNAS" })
            });
            tampilkanToast("Status penggajian diubah menjadi Sudah Dibayar (Lunas).", "success");
        }
        await muatPenggajian();
        tampilkanTabelPenggajian();
    } catch (e) {
        tampilkanToast("Gagal mengubah status pembayaran: " + e.message, "danger");
    }
}

async function tanganiKirimPenggajian(e) {
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
            await ambilDataApi(`${API_BASE}/payroll/${idVal}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            tampilkanToast("Data penggajian berhasil diperbarui!", "success");
        } else {
            await ambilDataApi(`${API_BASE}/payroll`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            tampilkanToast("Data penggajian baru berhasil ditambahkan!", "success");
        }
        tutupModal("payroll-modal");
        await muatPenggajian();
        tampilkanTabelPenggajian();
    } catch(e) {
        tampilkanToast("Gagal menyimpan data penggajian: " + e.message, "danger");
    }
}
window.tanganiKirimPenggajian = tanganiKirimPenggajian;

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
    document.getElementById("slip-rate").textContent          = formatRupiah(p.ratePerShift || 75000);
    document.getElementById("slip-shifts").textContent        = `${p.totalShifts || 0} shift`;
    document.getElementById("slip-total").textContent         = formatRupiah(p.totalSalary);

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
    bukaModal("slip-gaji-modal");
}

window.handleBuktiTFUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { tampilkanToast("Ukuran file maksimal 5MB!", "warning"); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl     = e.target.result;
        const preview     = document.getElementById("bukti-tf-preview");
        const placeholder = document.getElementById("bukti-tf-placeholder");
        const hapusBtn    = document.getElementById("btn-hapus-bukti");
        
        if (!_currentSlipData) return;
        
        try {
            await ambilDataApi(`${API_BASE}/payroll/${_currentSlipData.p.id}/upload-bukti`, {
                method: 'POST',
                body: JSON.stringify({ buktiTF: dataUrl })
            });
            
            preview.src = dataUrl; preview.classList.remove("hidden");
            placeholder.style.display = "none"; hapusBtn.classList.remove("hidden");
            
            await muatPenggajian();
            const updatedP = PAYROLL.find(x => x.id === _currentSlipData.p.id);
            if (updatedP) _currentSlipData.p = updatedP;
            
            tampilkanToast("Bukti transfer berhasil diupload!", "success");
        } catch(err) {
            tampilkanToast("Gagal mengupload bukti transfer: " + err.message, "danger");
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
        await ambilDataApi(`${API_BASE}/payroll/${_currentSlipData.p.id}/bukti`, { method: 'DELETE' });
        
        preview.src = ""; preview.classList.add("hidden");
        placeholder.style.display = "flex"; hapusBtn.classList.add("hidden");
        if (fileInput) fileInput.value = "";
        
        await muatPenggajian();
        const updatedP = PAYROLL.find(x => x.id === _currentSlipData.p.id);
        if (updatedP) _currentSlipData.p = updatedP;
        
        tampilkanToast("Bukti transfer dihapus.", "success");
    } catch(err) {
        tampilkanToast("Gagal menghapus bukti transfer: " + err.message, "danger");
    }
}

window.sendSlipEmail = async function() {
    if (!_currentSlipData) return;
    const { p, cashierEmail } = _currentSlipData;
    if (cashierEmail === "(email tidak terdaftar)") { tampilkanToast("Email kasir tidak terdaftar!", "warning"); return; }
    
    const btn = document.getElementById("btn-send-slip-email");
    const originalText = btn ? btn.innerHTML : "Kirim Slip Email";
    if (btn) {
        btn.setAttribute("disabled", "true");
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
    }
    
    try {
        const result = await ambilDataApi(`${API_BASE}/payroll/${p.id}/send-email`, {
            method: "POST"
        });
        tampilkanToast(result.message || "Slip gaji berhasil dikirim ke email!", "success");
    } catch (err) {
        console.error(err);
        tampilkanToast("Gagal mengirim slip gaji: " + err.message, "danger");
    } finally {
        if (btn) {
            btn.removeAttribute("disabled");
            btn.innerHTML = originalText;
        }
    }
}

function eksporPenggajianKeExcel() {
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
        formatRupiah(p.ratePerShift || 75000),
        p.totalShifts || 0,
        formatRupiah(p.totalSalary || 0)
    ]);

    eksporKeExcel("Laporan_Gaji_Kasir.csv", headers, rows);
    tampilkanToast("Laporan Penggajian Kasir berhasil diexport ke Excel!", "success");
}
