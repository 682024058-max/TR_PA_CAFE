// manager-akun.js - Kelola Akun Kasir

async function muatDaftarKasir() {
    try {
        const data = await ambilDataApi(`${API_BASE}/users`);
        CASHIERS   = (data.data || []).filter(u => u.role === 'kasir');
        tampilkanTabelKasir();
        isiPilihanKasirPenggajian();
    } catch(e) {
        tampilkanToast('Gagal memuat data kasir: ' + e.message, 'danger');
    }
}

function inisialisasiCRUDKasir() {
    document.getElementById("btn-add-cashier-modal")?.addEventListener("click", () => {
        document.getElementById("cashier-form")?.reset();
        document.getElementById("cashier-form-id").value = "";
        document.getElementById("cashier-modal-title").textContent = "Buat Akun Kasir Baru";
        
        const pwWrap = document.getElementById("cashier-password-wrapper");
        if (pwWrap) pwWrap.style.display = "";
        const pwInput = document.getElementById("cashier-form-password");
        if (pwInput) pwInput.required = true;
        bukaModal("cashier-modal");
    });
    document.getElementById("cashier-search")?.addEventListener("input", tampilkanTabelKasir);
}

function tampilkanTabelKasir() {
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
        const pwDisplay = c.password_plain
            ? `<span class="pw-reveal" style="font-family:monospace;font-size:12px;background:#f5f2eb;padding:3px 8px;border-radius:4px;border:1px solid #e1dcd6;cursor:default;user-select:all;" title="Password Kasir">${c.password_plain}</span>`
            : `<span style="color:var(--text-muted);font-size:11px"><i class="fa-solid fa-lock"></i> Terenkripsi</span>`;
        tr.innerHTML = `
            <td><strong>${c.nama}</strong></td>
            <td><code>${c.username}</code></td>
            <td>${c.email || '-'}</td>
            <td>${pwDisplay}</td>
            <td><span class="badge ${c.status === 'aktif' ? 'badge-success' : 'badge-danger'}">${c.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
            <td>
                <button class="btn-secondary" onclick="toggleCashierStatus(${c.id_user}, '${c.status}')" style="padding:4px 10px;font-size:10px">
                    ${c.status === 'aktif' ? 'Blokir Akses' : 'Aktifkan'}
                </button>
            </td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="editCashier(${c.id_user})" style="padding:6px 12px;font-size:11px"><i class="fa-solid fa-pencil"></i> Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleCashierStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif';
    try {
        await ambilDataApi(`${API_BASE}/users/${id}`, { method:'PUT', body: JSON.stringify({ status: newStatus }) });
        tampilkanToast(`Status kasir diubah menjadi ${newStatus}!`, 'success');
        await muatDaftarKasir();
    } catch(e) {
        tampilkanToast('Gagal ubah status: ' + e.message, 'danger');
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

    const pwWrap  = document.getElementById("cashier-password-wrapper");
    const pwInput = document.getElementById("cashier-form-password");
    if (pwWrap)  pwWrap.style.display = "";
    if (pwInput) {
        pwInput.required = false;
        pwInput.value = c.password_plain || "";
        pwInput.placeholder = c.password_plain ? c.password_plain : "Kosongkan jika tidak ingin mengubah";
    }
    bukaModal("cashier-modal");
}

async function tanganiKirimKasir(e) {
    e.preventDefault();
    const idVal    = document.getElementById("cashier-form-id").value;
    const nama     = document.getElementById("cashier-form-name").value.trim();
    const username = document.getElementById("cashier-form-username").value.trim();
    const email    = document.getElementById("cashier-form-email").value.trim();
    const status   = document.getElementById("cashier-form-status").value;
    const password = document.getElementById("cashier-form-password")?.value || "";

    try {
        if (idVal) {
            const payload = { nama, username, email, status };
            if (password) payload.password = password;
            await ambilDataApi(`${API_BASE}/users/${idVal}`, { method:'PUT', body: JSON.stringify(payload) });
            tampilkanToast("Akun kasir berhasil diperbarui!", "success");
        } else {
            if (!password) { tampilkanToast("Password wajib diisi untuk akun baru!", "warning"); return; }
            await ambilDataApi(`${API_BASE}/users`, {
                method: 'POST',
                body: JSON.stringify({ nama, username, password, email, role: 'kasir' })
            });
            tampilkanToast("Akun kasir baru berhasil dibuat!", "success");
        }
        tutupModal("cashier-modal");
        await muatDaftarKasir();
    } catch(e) {
        tampilkanToast("Gagal simpan kasir: " + e.message, "danger");
    }
}
window.tanganiKirimKasir = tanganiKirimKasir;
