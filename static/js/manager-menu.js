// manager-menu.js - Kelola Menu dan Kategori

async function muatDaftarMenu() {
    try {
        const data = await ambilDataApi(`${API_BASE}/products`);
        MENU_ITEMS = (data.data || []).map(p => ({
            id       : p.id_product,
            name     : p.nama_product,
            category : p.kategori,
            price    : Number(p.harga),
            foto     : p.foto,
            warna    : p.warna || '#4e3629'
        }));
        isiFilterKategoriMenu();
        saringTabelMenu();
    } catch(e) {
        tampilkanToast('Gagal memuat data menu: ' + e.message, 'danger');
    }
}

async function muatKategori() {
    try {
        const data = await ambilDataApi(`${API_BASE}/kategori`);
        const iconMap = {
            'coffee'    : 'fa-mug-hot',
            'non-coffee': 'fa-glass-water',
            'snack'     : 'fa-cookie',
            'dessert'   : 'fa-cookie'
        };
        CATEGORIES = (data.data || []).map(c => ({
            db_id: c.db_id,
            id   : c.id_kategori,
            name : c.nama_kategori,
            icon : iconMap[c.id_kategori] || 'fa-tag'
        }));
    } catch(e) {
        console.error('Gagal load kategori:', e);
    }
}

window.pindahTabDalam = function(tabId) {
    document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-btn-${tabId}`)?.classList.add('active');
    document.querySelectorAll('.inner-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`inner-tab-${tabId}`)?.classList.add('active');

    if      (tabId === 'daftar-menu')     muatDaftarMenu();
    else if (tabId === 'kelola-kategori') { muatKategori().then(tampilkanTabelKategori); }
}

function isiFilterKategoriMenu() {
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

function inisialisasiCRUDMenu() {
    document.getElementById("btn-add-menu-modal")?.addEventListener("click", () => {
        document.getElementById("menu-form")?.reset();
        document.getElementById("menu-form-id").value = "";
        document.getElementById("menu-modal-title").textContent = "Tambah Menu Baru";
        aturUlangAreaFotoMenu();
        if (!CATEGORIES.length) {
            muatKategori().then(() => isiKategoriFormMenu());
        } else {
            isiKategoriFormMenu();
        }
        bukaModal("menu-modal");
    });
    document.getElementById("menu-search")?.addEventListener("input", saringTabelMenu);
    document.getElementById("menu-filter-category")?.addEventListener("change", saringTabelMenu);
}

function isiKategoriFormMenu(selectedVal) {
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

function aturUlangAreaFotoMenu() {
    const preview     = document.getElementById("menu-image-preview-element");
    const placeholder = document.getElementById("menu-photo-placeholder");
    if (preview) { preview.src = ""; preview.classList.add("hidden"); }
    if (placeholder) placeholder.style.display = "flex";
    const fi = document.getElementById("menu-file-input");
    if (fi) fi.value = "";
    const imgInput = document.getElementById("menu-form-image");
    if (imgInput) imgInput.value = "";
}

window.tanganiUnggahBerkasMenu = function(input) {
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

function saringTabelMenu() {
    const searchVal = (document.getElementById("menu-search")?.value || "").toLowerCase();
    const catVal    = document.getElementById("menu-filter-category")?.value || "all";
    const filtered  = MENU_ITEMS.filter(item => {
        const mSearch = item.name.toLowerCase().includes(searchVal);
        const mCat    = catVal === "all" || item.category === catVal;
        return mSearch && mCat;
    });
    tampilkanTabelMenu(filtered);
}

function tampilkanTabelMenu(items) {
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
        const photoHtml = item.foto 
            ? `<img src="${item.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="${item.name}">` 
            : `<i class="fa-solid fa-mug-hot"></i>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="width:48px;height:48px;background:rgba(78,54,41,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#4e3629;overflow:hidden;">
                    ${photoHtml}
                </div>
            </td>
            <td><strong>${item.name}</strong></td>
            <td><span class="category-pill">${catLabel}</span></td>
            <td><strong>${formatRupiah(item.price)}</strong></td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="editMenu(${item.id})" style="padding:6px 12px;font-size:11px;margin-right:6px"><i class="fa-solid fa-pencil"></i> Edit</button>
                <button class="btn-danger"    onclick="hapusMenu(${item.id})" style="padding:6px 12px;font-size:11px"><i class="fa-solid fa-trash"></i> Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editMenu = function(id) {
    const item = MENU_ITEMS.find(m => m.id === id);
    if (!item) return;
    if (!CATEGORIES.length) muatKategori().then(() => isiKategoriFormMenu(item.category));
    else isiKategoriFormMenu(item.category);
    document.getElementById("menu-form-id").value    = item.id;
    document.getElementById("menu-form-name").value  = item.name;
    document.getElementById("menu-form-desc").value  = "";
    document.getElementById("menu-form-price").value = item.price;
    aturUlangAreaFotoMenu();
    if (item.foto) {
        const preview = document.getElementById("menu-image-preview-element");
        const placeholder = document.getElementById("menu-photo-placeholder");
        const imgInput = document.getElementById("menu-form-image");
        if (preview) { preview.src = item.foto; preview.classList.remove("hidden"); }
        if (placeholder) placeholder.style.display = "none";
        if (imgInput) imgInput.value = item.foto;
    }
    document.getElementById("menu-modal-title").textContent = "Edit Menu";
    bukaModal("menu-modal");
}

window.hapusMenu = async function(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus menu ini?")) return;
    try {
        await ambilDataApi(`${API_BASE}/products/${id}`, { method: 'DELETE' });
        tampilkanToast("Menu berhasil dihapus!", "success");
        await muatDaftarMenu();
    } catch(e) {
        tampilkanToast("Gagal hapus menu: " + e.message, "danger");
    }
}

async function tanganiKirimMenu(e) {
    e.preventDefault();
    const idVal    = document.getElementById("menu-form-id").value;
    const name     = document.getElementById("menu-form-name").value.trim();
    const category = document.getElementById("menu-form-category").value;
    const price    = parseInt(document.getElementById("menu-form-price").value);
    const foto     = document.getElementById("menu-form-image").value || "";

    if (!name || !category || !price) {
        tampilkanToast("Nama, kategori, dan harga wajib diisi!", "warning"); return;
    }

    const payload = { nama_product: name, kategori: category, harga: price, foto: foto, warna: '#4e3629' };

    try {
        if (idVal) {
            await ambilDataApi(`${API_BASE}/products/${idVal}`, { method:'PUT', body: JSON.stringify(payload) });
            tampilkanToast("Menu berhasil diperbarui!", "success");
        } else {
            await ambilDataApi(`${API_BASE}/products`, { method:'POST', body: JSON.stringify(payload) });
            tampilkanToast("Menu baru berhasil ditambahkan!", "success");
        }
        tutupModal("menu-modal");
        await muatDaftarMenu();
    } catch(e) {
        tampilkanToast("Gagal simpan menu: " + e.message, "danger");
    }
}
window.tanganiKirimMenu = tanganiKirimMenu;

function inisialisasiCRUDKategori() {
    const addBtn = document.getElementById("btn-add-category-modal");
    if (addBtn) addBtn.style.display = "";
    
    addBtn?.addEventListener("click", () => {
        document.getElementById("category-form")?.reset();
        document.getElementById("category-form-id").value = "";
        document.getElementById("category-modal-title").textContent = "Tambah Kategori Baru";
        bukaModal("category-modal");
    });
    
    document.getElementById("category-search")?.addEventListener("input", tampilkanTabelKategori);
    document.getElementById("category-form")?.addEventListener("submit", tanganiKirimKategori);
}

async function tanganiKirimKategori(e) {
    if (e) e.preventDefault();
    const idVal    = document.getElementById("category-form-id")?.value;
    const nameInput = document.getElementById("category-form-name");
    const name = nameInput ? nameInput.value.trim() : "";
    const icon = "fa-tag";

    if (!name) {
        tampilkanToast("Nama kategori wajib diisi!", "warning");
        return;
    }

    try {
        const payload = { nama_kategori: name, icon };
        if (idVal) {
            await ambilDataApi(`${API_BASE}/kategori/${idVal}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            tampilkanToast("Kategori berhasil diperbarui!", "success");
        } else {
            await ambilDataApi(`${API_BASE}/kategori`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            tampilkanToast("Kategori baru berhasil ditambahkan!", "success");
        }
        tutupModal("category-modal");
        await muatKategori();
        tampilkanTabelKategori();
        isiFilterKategoriMenu();
    } catch(e) {
        tampilkanToast("Gagal menyimpan kategori: " + e.message, "danger");
    }
}
window.tanganiKirimKategori = tanganiKirimKategori;

window.editKategori = function(dbId, nama) {
    document.getElementById("category-form")?.reset();
    document.getElementById("category-form-id").value = dbId;
    document.getElementById("category-form-name").value = nama;
    document.getElementById("category-modal-title").textContent = "Edit Kategori";
    bukaModal("category-modal");
};

window.deleteKategori = async function(dbId, nama) {
    if (!confirm(`Hapus kategori "${nama}"? Kategori yang masih memiliki produk tidak dapat dihapus.`)) return;
    try {
        await ambilDataApi(`${API_BASE}/kategori/${dbId}`, { method: 'DELETE' });
        tampilkanToast(`Kategori "${nama}" berhasil dihapus.`, 'success');
        await muatKategori();
        tampilkanTabelKategori();
        isiFilterKategoriMenu();
    } catch(e) {
        tampilkanToast('Gagal menghapus kategori: ' + e.message, 'danger');
    }
};

function tampilkanTabelKategori() {
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
            <td style="text-align:center"><span class="badge badge-success">Aktif</span></td>
            <td style="text-align:center">
                <button class="btn-secondary" onclick="editKategori(${cat.db_id}, '${cat.name.replace(/'/g, "\\'")}')"
                    style="padding:5px 10px;font-size:11px;margin-right:4px">
                    <i class="fa-solid fa-pencil"></i> Edit
                </button>
                <button class="btn-danger" onclick="deleteKategori(${cat.db_id}, '${cat.name.replace(/'/g, "\\'")}')"
                    style="padding:5px 10px;font-size:11px">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
